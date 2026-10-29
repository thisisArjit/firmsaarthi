import {AppError,type TransportService} from './service';
import type {Row} from './domain';
import {evidenceStages,type EvidenceStage} from './trip-stage-evidence';

// Unpublished owner-private file service, shared by the bounded stage-document API.
export class TripStageDocuments{
  constructor(private s:TransportService){}
  async upload(d:Row,file:{name:string;type:string;bytes:Uint8Array},bucket:R2Bucket){
    const s=this.s,m=await s.owner(),org=m.org_id;
    if(typeof d.requestId!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(d.requestId))throw new AppError('Invalid upload request ID.');
    const stage=d.stage as EvidenceStage;if(!evidenceStages.includes(stage))throw new AppError('Choose placement, loading or arrival evidence.');
    if(typeof d.version!=='number'||!Number.isSafeInteger(d.version)||d.version<1||d.version>=Number.MAX_SAFE_INTEGER)throw new AppError('Reload this trip before uploading.',409);
    const allocationId=d.allocationId===undefined||d.allocationId===null||d.allocationId===''?null:d.allocationId;
    if(stage==='placement'?allocationId!==null:typeof allocationId!=='string'||!allocationId)throw new AppError('Choose the correct trip or consignment scope for this stage.');
    const {bytes,type}=file;if(!bytes.length||bytes.length>2097152||!['application/pdf','image/jpeg','image/png'].includes(type))throw new AppError('Upload a PDF, PNG or JPEG up to 2 MB.');
    const signature=type==='application/pdf'?new TextDecoder().decode(bytes.slice(0,5))==='%PDF-':type==='image/png'?[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v):bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    if(!signature)throw new AppError('The file does not match its type.');
    const name=String(file.name||'Stage evidence').replace(/[\x00-\x1f\x7f]/g,'').slice(0,200)||'Stage evidence',sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as BufferSource)),n=>n.toString(16).padStart(2,'0')).join('');
    const documentId=`stage_doc_${org}_${d.requestId}`,payload=JSON.stringify({tripId:String(d.tripId),allocationId,stage,name,type,sha256,size:bytes.length}),old=await s.first('SELECT * FROM trip_stage_documents WHERE id=? AND org_id=?',documentId,org);
    if(old){if(old.payload!==payload)throw new AppError('This request ID was used with another stage document.',409);return {success:true,id:old.id,alreadyRecorded:true};}
    const trip=await s.owned('trips',String(d.tripId),org);
    if(!JSON.parse(trip.creation_payload).stagePolicySnapshot)throw new AppError('This trip does not use the stage evidence workflow.');
    const status=stage==='arrival'?'dispatched':'planned';if(trip.status!==status)throw new AppError('This stage is not open for file uploads.');
    if(trip.version!==d.version)throw new AppError('This trip changed. Reload before uploading.',409);
    if(allocationId&&!await s.first('SELECT id FROM trip_allocations WHERE id=? AND org_id=? AND trip_id=? AND active=1',allocationId,org,trip.id))throw new AppError('Choose an active consignment on this trip.');
    if((await s.first('SELECT COUNT(*) AS count FROM trip_stage_documents WHERE org_id=? AND trip_id=? AND stage=? AND allocation_id IS ?',org,trip.id,stage,allocationId))!.count>=20)throw new AppError('This stage has reached its 20-file limit. Keep the existing history.');
    const assetId=crypto.randomUUID(),objectKey=org+'/'+assetId,auditId=crypto.randomUUID(),at=new Date().toISOString();let databaseAttempted=false;
    try{
      await bucket.put(objectKey,bytes,{httpMetadata:{contentType:type}});databaseAttempted=true;
      const result=await s.db.batch([
        s.statement('UPDATE trips SET version=version+1 WHERE id=? AND org_id=? AND version=? AND status=? RETURNING id',trip.id,org,trip.version,status),
        s.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',auditId,org,s.user.userId,'trip.stage-file.upload',documentId,at),
        s.statement('INSERT INTO assets SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM audit WHERE id=?)',assetId,org,name,type,at,auditId),
        s.statement("INSERT INTO asset_scopes SELECT ?,?,'trip_stage' WHERE EXISTS(SELECT 1 FROM audit WHERE id=?)",assetId,org,auditId),
        s.statement('INSERT INTO trip_stage_documents SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM audit WHERE id=?)',documentId,org,trip.id,allocationId,assetId,stage,trip.version+1,sha256,bytes.length,payload,s.user.userId,at,auditId),
      ]);
      if(!result[0].results?.length)throw new AppError('This trip changed. Reload before uploading.',409);
      return {success:true,id:documentId};
    }catch(error){
      if(databaseAttempted){
        let committed:Row|null;try{committed=await s.first('SELECT * FROM trip_stage_documents WHERE id=? AND org_id=?',documentId,org);}catch{throw new AppError('Upload outcome is unavailable. Retry the same file and request before starting another upload.',503);}
        // A committed write with an uncertain response must keep its referenced object.
        if(committed?.asset_id===assetId&&committed.payload===payload)return {success:true,id:documentId,alreadyRecorded:true};
      }
      try{await bucket.delete(objectKey);}catch{throw new AppError('Upload failed and storage cleanup needs retry. No new file was confirmed.',503);}
      throw error;
    }
  }
  async list(tripId:string){const m=await this.s.owner();await this.s.owned('trips',tripId,m.org_id);return this.s.rows('SELECT d.id,d.asset_id,d.trip_id,d.allocation_id,d.stage,d.trip_version,d.sha256,d.size,d.actor,d.created_at,a.name,a.mime FROM trip_stage_documents d JOIN assets a ON a.id=d.asset_id AND a.org_id=d.org_id JOIN asset_scopes scope ON scope.asset_id=a.id AND scope.org_id=a.org_id AND scope.purpose=\'trip_stage\' WHERE d.org_id=? AND d.trip_id=? ORDER BY d.trip_version',m.org_id,tripId);}
  async state(tripId:string){
    const s=this.s,m=await s.owner();
    // A single SQL batch provides one version/file/review snapshot for draft conflict checks.
    const result=await s.db.batch([
      s.statement('SELECT version,status FROM trips WHERE id=? AND org_id=?',tripId,m.org_id),
      s.statement("SELECT d.id,d.asset_id,d.trip_id,d.allocation_id,d.stage,d.trip_version,d.sha256,d.size,d.actor,d.created_at,a.name,a.mime FROM trip_stage_documents d JOIN assets a ON a.id=d.asset_id AND a.org_id=d.org_id JOIN asset_scopes scope ON scope.asset_id=a.id AND scope.org_id=a.org_id AND scope.purpose='trip_stage' WHERE d.org_id=? AND d.trip_id=? ORDER BY d.trip_version",m.org_id,tripId),
      s.statement("SELECT r.id,r.document_id,r.kind,r.target_id,r.trip_version,r.event_at,r.note,r.actor,r.actor_role,r.recorded_at FROM trip_stage_reviews r JOIN trip_stage_documents d ON d.id=r.document_id AND d.org_id=r.org_id AND d.trip_id=r.trip_id JOIN asset_scopes scope ON scope.asset_id=d.asset_id AND scope.org_id=d.org_id AND scope.purpose='trip_stage' WHERE r.org_id=? AND r.trip_id=? ORDER BY r.trip_version",m.org_id,tripId),
    ]);
    const trip=result[0].results?.[0] as Row|undefined;if(!trip)throw new AppError('Trip not found.',404);
    return {tripId,version:trip.version,status:trip.status,documents:result[1].results,reviews:result[2].results};
  }
  async file(assetId:string){const m=await this.s.owner(),asset=await this.s.first("SELECT a.* FROM trip_stage_documents d JOIN trips t ON t.id=d.trip_id AND t.org_id=d.org_id JOIN assets a ON a.id=d.asset_id AND a.org_id=d.org_id JOIN asset_scopes scope ON scope.asset_id=a.id AND scope.org_id=a.org_id AND scope.purpose='trip_stage' WHERE d.org_id=? AND d.asset_id=?",m.org_id,assetId);if(!asset)throw new AppError('Stage document not found.',404);return {asset,org:m.org_id};}
}
