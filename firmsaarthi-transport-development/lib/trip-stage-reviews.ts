import {AppError,type TransportService} from './service';
import type {Row} from './domain';
import type {StageEvidenceDocument} from './trip-stage-evidence';

// Local foundation only. No review route, UI or milestone transition uses this yet.
export class TripStageReviews{
  constructor(private s:TransportService){}
  async record(d:Row){
    const s=this.s,m=await s.owner(),org=m.org_id;
    if(typeof d.requestId!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(d.requestId))throw new AppError('Invalid review request ID.');
    if(!['accept','reject','correction'].includes(d.kind))throw new AppError('Choose a supported document review.');
    if(typeof d.version!=='number'||!Number.isSafeInteger(d.version)||d.version<1||d.version>=Number.MAX_SAFE_INTEGER)throw new AppError('Reload this trip before reviewing.',409);
    if(typeof d.documentId!=='string'||!d.documentId||typeof d.tripId!=='string'||!d.tripId)throw new AppError('Choose a stage document.');
    const targetId=d.targetId===undefined||d.targetId===null?null:d.targetId;
    if(d.kind==='correction'?typeof targetId!=='string'||!targetId:targetId!==null)throw new AppError('Choose the review being corrected.');
    if(typeof d.note!=='string'||d.note.length>500||(d.kind!=='accept'&&!d.note.trim()))throw new AppError('Give a review reason up to 500 characters.');
    const at=new Date().toISOString();
    if(typeof d.eventAt!=='string'||!Number.isFinite(Date.parse(d.eventAt))||new Date(d.eventAt).toISOString()!==d.eventAt||d.eventAt>at)throw new AppError('Choose a valid review time that is not in the future.');
    const id=`stage_review_${org}_${d.requestId}`,payload=JSON.stringify({tripId:d.tripId,documentId:d.documentId,kind:d.kind,targetId,eventAt:d.eventAt,note:d.note}),old=await s.first('SELECT * FROM trip_stage_reviews WHERE id=? AND org_id=?',id,org);
    if(old){if(old.payload!==payload)throw new AppError('This request ID was used with another review.',409);return {success:true,id,alreadyRecorded:true};}
    const trip=await s.owned('trips',d.tripId,org),doc=await s.first("SELECT d.* FROM trip_stage_documents d JOIN asset_scopes scope ON scope.asset_id=d.asset_id AND scope.org_id=d.org_id AND scope.purpose='trip_stage' WHERE d.id=? AND d.trip_id=? AND d.org_id=?",d.documentId,trip.id,org);
    if(!doc)throw new AppError('Stage document not found.',404);
    if(trip.version!==d.version)throw new AppError('This trip changed. Reload before reviewing.',409);
    if(trip.status!==(doc.stage==='arrival'?'dispatched':'planned'))throw new AppError('This stage is not open for review.');
    if(doc.allocation_id&&!await s.first('SELECT id FROM trip_allocations WHERE id=? AND trip_id=? AND org_id=? AND active=1',doc.allocation_id,trip.id,org))throw new AppError('This consignment is no longer active on this trip.');
    if(d.eventAt<doc.created_at)throw new AppError('Review time must follow the file upload.');
    const active=await s.first("SELECT r.* FROM trip_stage_reviews r WHERE r.org_id=? AND r.trip_id=? AND r.document_id=? AND r.kind<>'correction' AND NOT EXISTS(SELECT 1 FROM trip_stage_reviews c WHERE c.org_id=r.org_id AND c.trip_id=r.trip_id AND c.kind='correction' AND c.target_id=r.id) ORDER BY r.trip_version DESC LIMIT 1",org,trip.id,doc.id);
    if(d.kind==='correction'){
      if(!active||active.id!==targetId)throw new AppError('Choose the active review for this exact file.');
      if(d.eventAt<active.event_at)throw new AppError('Correction time must follow the review.');
      if(active.kind==='accept'&&await this.hasDependents(org,trip.id,doc))throw new AppError('Reverse dependent trip progress before correcting accepted evidence.');
    }else if(active)throw new AppError('Correct the active review before recording another decision.');
    const latest=await s.first('SELECT event_at FROM trip_stage_reviews WHERE org_id=? AND trip_id=? AND document_id=? ORDER BY trip_version DESC LIMIT 1',org,trip.id,doc.id);
    if(latest&&d.eventAt<latest.event_at)throw new AppError('Review time must follow this file’s review history.');
    const audit=crypto.randomUUID();
    try{
      const result=await s.db.batch([
        s.statement('UPDATE trips SET version=version+1 WHERE id=? AND org_id=? AND version=? AND status=? RETURNING id',trip.id,org,trip.version,trip.status),
        s.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',audit,org,s.user.userId,'trip.stage-file.review',id,at),
        s.statement('INSERT INTO trip_stage_reviews SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM audit WHERE id=?)',id,org,trip.id,doc.id,d.kind,targetId,trip.version+1,d.eventAt,d.note,payload,s.user.userId,'OWNER',at,audit),
      ]);
      if(!result[0].results?.length)throw new AppError('This trip changed. Reload before reviewing.',409);
    }catch(error){
      let committed:Row|null;try{committed=await s.first('SELECT * FROM trip_stage_reviews WHERE id=? AND org_id=?',id,org);}catch{throw new AppError('Review outcome is unavailable. Retry the same review and request.',503);}
      if(committed?.payload===payload)return {success:true,id,alreadyRecorded:true};
      if(committed)throw new AppError('This request ID was used with another review.',409);
      throw error;
    }
    return {success:true,id};
  }
  private hasDependents(org:string,tripId:string,doc:Row){return this.s.first("SELECT e.id FROM trip_events e WHERE e.org_id=? AND e.trip_id=? AND ((?='placement' AND e.kind IN ('placement','loading','arrival','dispatch','delivery','close')) OR (?='loading' AND (e.kind IN ('dispatch','close') OR (e.kind IN ('loading','arrival','delivery') AND e.allocation_id=?))) OR (?='arrival' AND (e.kind='close' OR (e.kind IN ('arrival','delivery') AND e.allocation_id=?)))) AND NOT EXISTS(SELECT 1 FROM trip_events c WHERE c.org_id=e.org_id AND c.trip_id=e.trip_id AND c.kind='correction' AND c.target_event_id=e.id) LIMIT 1",org,tripId,doc.stage,doc.stage,doc.allocation_id,doc.stage,doc.allocation_id);}
  async history(tripId:string){const m=await this.s.owner();await this.s.owned('trips',tripId,m.org_id);return this.s.rows("SELECT r.* FROM trip_stage_reviews r JOIN trip_stage_documents d ON d.id=r.document_id AND d.org_id=r.org_id AND d.trip_id=r.trip_id JOIN asset_scopes scope ON scope.asset_id=d.asset_id AND scope.org_id=d.org_id AND scope.purpose='trip_stage' WHERE r.org_id=? AND r.trip_id=? ORDER BY r.trip_version",m.org_id,tripId);}
  async documents(tripId:string):Promise<StageEvidenceDocument[]>{
    const m=await this.s.owner();await this.s.owned('trips',tripId,m.org_id);
    // One joined read avoids mixing files with a different review revision.
    const rows=await this.s.rows("SELECT d.id,d.org_id,d.trip_id,d.stage,d.allocation_id,r.kind,r.actor_role FROM trip_stage_documents d JOIN asset_scopes scope ON scope.asset_id=d.asset_id AND scope.org_id=d.org_id AND scope.purpose='trip_stage' LEFT JOIN trip_stage_reviews r ON r.document_id=d.id AND r.org_id=d.org_id AND r.trip_id=d.trip_id AND r.kind<>'correction' AND NOT EXISTS(SELECT 1 FROM trip_stage_reviews c WHERE c.org_id=r.org_id AND c.trip_id=r.trip_id AND c.kind='correction' AND c.target_id=r.id) WHERE d.org_id=? AND d.trip_id=? ORDER BY d.trip_version",m.org_id,tripId);
    return rows.map(r=>({id:r.id,orgId:r.org_id,tripId:r.trip_id,purpose:'trip_stage',stage:r.stage,allocationId:r.allocation_id,review:r.kind?{decision:r.kind,actorRoleAtReview:r.actor_role,corrected:false}:null}));
  }
}
