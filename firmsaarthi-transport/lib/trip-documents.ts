import { AppError, type TransportService } from './service';
import { TripService } from './trip-service';
import type { Row } from './domain';

export class TripDocuments {
  constructor(private s:TransportService){}
  async upload(d:Row,file:{name:string;type:string;bytes:Uint8Array},bucket:R2Bucket){
    const s=this.s,m=await s.owner(),org=m.org_id;
    if(!/^[a-zA-Z0-9-]{8,80}$/.test(String(d.requestId||'')))throw new AppError('Invalid request ID.');
    const {bytes,type}=file;
    if(!bytes.length||bytes.length>2*1024*1024||!['image/png','image/jpeg','application/pdf'].includes(type))throw new AppError('Upload a PDF, PNG or JPEG up to 2 MB.');
    if(type==='image/png'&&![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)||type==='image/jpeg'&&!(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)||type==='application/pdf'&&new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw new AppError('The file does not match its type.');
    const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as BufferSource)),b=>b.toString(16).padStart(2,'0')).join('');
    const documentId=`pod_${org}_${d.requestId}`,name=String(file.name||'POD').replace(/[\x00-\x1f\x7f]/g,'').slice(0,200),payload=JSON.stringify({tripId:String(d.tripId),allocationId:String(d.allocationId),name,type,sha256,size:bytes.length});
    const old=await s.first('SELECT * FROM trip_documents WHERE id=? AND org_id=?',documentId,org);
    if(old){if(old.payload!==payload)throw new AppError('This request ID was used with another document.',409);return {success:true,id:old.id,alreadyRecorded:true};}
    const state=await new TripService(s).detail(String(d.tripId)),item=state.items.find((a:Row)=>a.id===d.allocationId);
    if(!item?.delivery||state.trip.status!=='dispatched')throw new AppError('Upload POD for a delivered consignment on an open trip.');
    if(item.pod?.kind==='pod_accept')throw new AppError('Correct or reject the accepted POD review before uploading a replacement.');
    if(Number(d.version)!==state.trip.version)throw new AppError('This trip changed. Reload before uploading.',409);
    if((await s.first('SELECT COUNT(*) AS count FROM trip_documents WHERE org_id=? AND allocation_id=?',org,item.id))!.count>=20)throw new AppError('This consignment has reached its 20-document limit. Keep the existing history.');
    // Unique object per attempt: a losing concurrent upload can delete only its own bytes.
    const assetId=crypto.randomUUID(),auditId=crypto.randomUUID(),t=new Date().toISOString(),objectKey=`${org}/${assetId}`;
    await bucket.put(objectKey,bytes,{httpMetadata:{contentType:type}});
    try{
      const result=await s.db.batch([
        s.statement("UPDATE trips SET version=version+1 WHERE id=? AND org_id=? AND version=? AND status='dispatched' RETURNING id",state.trip.id,org,state.trip.version),
        s.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',auditId,org,s.user.userId,'trip.pod.upload',documentId,t),
        s.statement('INSERT INTO assets SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM audit WHERE id=?)',assetId,org,name,type,t,auditId),
        s.statement("INSERT INTO asset_scopes SELECT ?,?,'trip_pod' WHERE EXISTS(SELECT 1 FROM audit WHERE id=?)",assetId,org,auditId),
        s.statement('INSERT INTO trip_documents SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM audit WHERE id=?)',documentId,org,state.trip.id,item.id,assetId,sha256,bytes.length,payload,s.user.userId,t,auditId),
      ]);
      if(!result[0].results?.length)throw new AppError('This trip changed. Reload before uploading.',409);
    }catch(e){await bucket.delete(objectKey);throw e;}
    return {success:true,id:documentId};
  }
}
