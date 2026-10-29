import {AppError,type TransportService} from './service';
import type {Row} from './domain';
import {actualTime,tripProgress} from './trip-domain';
import {planStageTransition,type StageTransitionContext,type StageTransitionRequest,type StageTransitionPlan} from './trip-stage-transition';
import {planTripFollowUp,type TripFollowUpContext,type TripFollowUpRequest} from './trip-follow-up';

// Unpublished opt-in trip event service. Hosted/UI validation is still required before release.
// The snapshot includes private evidence; never expose it through operational DTOs.
export class TripStageService{
  constructor(private s:TransportService){}
  private async snapshot(tripId:string,org:string){
    const s=this.s,result=await s.db.batch([
      s.statement('SELECT * FROM trips WHERE id=? AND org_id=?',tripId,org),
      s.statement('SELECT id,consignment_id,snapshot FROM trip_allocations WHERE trip_id=? AND org_id=? AND active=1 ORDER BY id',tripId,org),
      s.statement('SELECT * FROM trip_events WHERE trip_id=? AND org_id=? ORDER BY version',tripId,org),
      s.statement("SELECT d.id,d.stage,d.allocation_id,r.id AS review_id,r.kind,r.actor_role FROM trip_stage_documents d JOIN asset_scopes scope ON scope.asset_id=d.asset_id AND scope.org_id=d.org_id AND scope.purpose='trip_stage' LEFT JOIN trip_stage_reviews r ON r.document_id=d.id AND r.org_id=d.org_id AND r.trip_id=d.trip_id AND r.kind<>'correction' AND NOT EXISTS(SELECT 1 FROM trip_stage_reviews c WHERE c.org_id=r.org_id AND c.trip_id=r.trip_id AND c.kind='correction' AND c.target_id=r.id) WHERE d.trip_id=? AND d.org_id=? ORDER BY d.id",tripId,org),
      s.statement('SELECT * FROM trip_stage_evidence_uses WHERE trip_id=? AND org_id=? ORDER BY event_id',tripId,org),
      s.statement('SELECT * FROM trip_stage_event_dependencies WHERE trip_id=? AND org_id=? ORDER BY event_id,prerequisite_event_id',tripId,org),
      s.statement("SELECT d.* FROM trip_documents d JOIN asset_scopes scope ON scope.asset_id=d.asset_id AND scope.org_id=d.org_id AND scope.purpose='trip_pod' WHERE d.trip_id=? AND d.org_id=?",tripId,org),
      s.statement('SELECT r.* FROM trip_document_reviews r JOIN trip_events e ON e.id=r.event_id AND e.org_id=r.org_id WHERE e.trip_id=? AND e.org_id=?',tripId,org),
    ]),rows=result.map(r=>(r.results||[]) as Row[]),trip=rows[0][0];
    if(!trip)throw new AppError('Trip not found.',404);
    const creation=JSON.parse(trip.creation_payload);
    if(creation.stagePolicyRequest?.contract!=='workspace_stage_v1'||!creation.stagePolicySnapshot)throw new AppError('This trip retains its existing workflow.');
    const events=rows[2].map(e=>{
      const uses=rows[4].filter(u=>u.event_id===e.id).map(u=>({documentId:u.document_id,reviewId:u.review_id})),parents=rows[5].filter(p=>p.event_id===e.id).map(p=>p.prerequisite_event_id).sort(),payload=JSON.parse(e.payload),marker=payload.stageTransition;
      const physical=e.kind!=='cancel';
      if(physical||marker){
        if(!['physical_stage_v1','trip_follow_up_v1'].includes(marker?.contract)||!Array.isArray(marker.prerequisiteEventIds)||!Array.isArray(marker.evidenceUses)||JSON.stringify([...marker.prerequisiteEventIds].sort())!==JSON.stringify(parents)||JSON.stringify(marker.evidenceUses)!==JSON.stringify(uses))throw new AppError('Stage evidence history is incomplete. Contact the workspace owner.',409);
        if(marker.contract==='trip_follow_up_v1'&&(payload.documentId||null)!==(rows[7].find(r=>r.event_id===e.id)?.document_id||null))throw new AppError('Original POD review evidence is incomplete.',409);
      }else if(uses.length||parents.length)throw new AppError('Stage evidence history is inconsistent.',409);
      return {id:e.id,orgId:e.org_id,tripId:e.trip_id,version:e.version,kind:e.kind,allocationId:e.allocation_id,targetId:e.target_event_id,eventAt:e.event_at,evidenceUses:uses};
    });
    const context:StageTransitionContext={orgId:org,tripId,version:trip.version,status:trip.status,createdAt:trip.created_at,recordedAt:new Date().toISOString(),policy:creation.stagePolicySnapshot.policy,
      allocations:rows[1].map(a=>({id:a.id,bookingAt:new Date(JSON.parse(a.snapshot).date+'T00:00:00+05:30').toISOString()})),events,
      documents:rows[3].map(d=>({id:d.id,orgId:org,tripId,purpose:'trip_stage',stage:d.stage,allocationId:d.allocation_id,review:d.review_id?{id:d.review_id,decision:d.kind,actorRoleAtReview:d.actor_role,corrected:false}:null})),
    };
    return {trip,allocations:rows[1],context,podDocuments:rows[6].map(d=>({id:d.id,orgId:d.org_id,tripId:d.trip_id,allocationId:d.allocation_id,purpose:'trip_pod' as const,createdAt:d.created_at})),podReviewLinks:rows[7].map(r=>({eventId:r.event_id,documentId:r.document_id}))};
  }
  async record(d:Row){
    const s=this.s,m=await s.member(),org=m.org_id;
    if(typeof d.tripId!=='string'||!d.tripId||d.tripId.length>200||typeof d.requestId!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(d.requestId))throw new AppError('Choose a trip and a valid event request ID.');
    if(!['placement','loading','arrival','dispatch','delivery','correction','pod_accept','pod_reject','exception','exception_resolve','close'].includes(d.kind))throw new AppError('Choose a supported trip action.');
    if(['correction','pod_accept','pod_reject','close'].includes(d.kind)&&m.role!=='OWNER')throw new AppError('Only the workspace owner can review POD, close or correct trips.',403);
    if(typeof d.version!=='number'||!Number.isSafeInteger(d.version)||d.version<1||d.version>=Number.MAX_SAFE_INTEGER)throw new AppError('Reload this trip before continuing.',409);
    if(['evidenceUses','prerequisiteEventIds','stageTransition','orgId','actor','role'].some(k=>Object.hasOwn(d,k))||d.documentId!==undefined&&d.documentId!==null&&d.documentId!==''&&!['pod_accept','pod_reject'].includes(d.kind))throw new AppError('Stage evidence is resolved from the saved trip, not supplied with the event.');
    const text=(v:unknown,max:number)=>{if(v!==undefined&&typeof v!=='string')throw new AppError('Use valid event details.');const value=(v as string|undefined||'').trim();if(value.length>max)throw new AppError('Event details are too long.');return value;};
    const allocationId=d.allocationId===undefined||d.allocationId===null?null:text(d.allocationId,200),targetId=d.targetEventId===undefined||d.targetEventId===null?null:text(d.targetEventId,200),reference=text(d.reference,200),note=text(d.note,500);
    if(d.kind==='correction'&&!note)throw new AppError('Give a correction reason.');if(d.kind==='delivery'&&!reference)throw new AppError('Give a delivery / receiver reference.');
    let eventAt:string;try{eventAt=actualTime(d.eventAt);}catch(e){throw new AppError((e as Error).message);}
    const documentId=d.documentId===undefined||d.documentId===null?null:text(d.documentId,200)||null;
    const request={kind:d.kind,eventAt,allocationId,targetId,reference,note,...(documentId?{documentId}:{})},id=`trip_event_${d.tripId}_${d.requestId}`,canonical=JSON.stringify(request),old=await s.first('SELECT * FROM trip_events WHERE id=? AND org_id=?',id,org);
    const matches=(row:Row)=>{const payload=JSON.parse(row.payload),{stageTransition,...original}=payload;return ['physical_stage_v1','trip_follow_up_v1'].includes(stageTransition?.contract)&&JSON.stringify(original)===canonical;};
    if(old){if(!matches(old))throw new AppError('This request ID was used with different event details.',409);return {success:true,id,alreadyRecorded:true};}
    const {trip,context,allocations,podDocuments,podReviewLinks}=await this.snapshot(d.tripId,org);
    if(trip.version!==d.version)throw new AppError('This trip changed. Reload before continuing.',409);
    const follow=['pod_accept','pod_reject','exception','exception_resolve','close'].includes(d.kind)||(d.kind==='correction'&&!context.events.some(e=>e.id===targetId&&['placement','loading','arrival'].includes(e.kind)));
    let plan:{prerequisiteEventIds:readonly string[];evidenceUses:StageTransitionPlan['evidenceUses'];status?:string};
    try{if(follow){const result=planTripFollowUp({...context,actorRole:m.role,podPolicy:trip.pod_policy,podDocuments,podReviewLinks} as TripFollowUpContext,{...request,documentId} as TripFollowUpRequest);plan={...result,evidenceUses:[]};}else plan=planStageTransition(context,{kind:d.kind,allocationId,targetId,eventAt} as StageTransitionRequest);}catch(e){throw new AppError((e as Error).message);}
    const status=plan.status||(d.kind==='dispatch'?'dispatched':trip.status),at=new Date().toISOString(),audit=crypto.randomUUID(),payload=JSON.stringify({...request,stageTransition:{contract:follow?'trip_follow_up_v1':'physical_stage_v1',prerequisiteEventIds:plan.prerequisiteEventIds,evidenceUses:plan.evidenceUses}});
    const projected=tripProgress(allocations,context.events.map(e=>({id:e.id,kind:e.kind,allocation_id:e.allocationId,target_event_id:e.targetId,event_at:e.eventAt})).concat([{id,kind:d.kind,allocation_id:allocationId,target_event_id:targetId,event_at:eventAt}]));
    try{
      const result=await s.db.batch([
        s.statement("UPDATE trips SET status=?,version=version+1 WHERE id=? AND org_id=? AND version=? AND EXISTS(SELECT 1 FROM memberships m WHERE m.org_id=trips.org_id AND m.user_id=? AND m.role IN ('OWNER','MEMBER','DISPATCHER') AND (? NOT IN ('correction','pod_accept','pod_reject','close') OR m.role='OWNER')) AND (?<>'dispatched' OR NOT EXISTS(SELECT 1 FROM trips other WHERE other.org_id=trips.org_id AND other.vehicle_id=trips.vehicle_id AND other.status='dispatched' AND other.id<>trips.id AND (json_extract(trips.creation_payload,'$.identity') IS NOT 'consignment_v1' OR json_extract(other.creation_payload,'$.identity') IS NOT 'consignment_v1'))) RETURNING id",status,trip.id,org,trip.version,s.user.userId,d.kind,status),
        s.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',audit,org,s.user.userId,'trip.'+d.kind,trip.id,at),
        s.statement('INSERT INTO trip_events SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM audit WHERE id=?)',id,org,trip.id,trip.version+1,d.kind,allocationId,targetId,eventAt,reference,note,payload,s.user.userId,at,audit),
        // Validated event insertion materializes every declared link in the same SQL transaction.
        ...((['dispatch','delivery'].includes(d.kind)||d.kind==='correction'&&context.events.some(e=>e.id===targetId&&['dispatch','delivery'].includes(e.kind)))?projected.items.map((a:Row)=>s.statement('UPDATE consignments SET stage_status=?,stage_version=stage_version+1 WHERE id=? AND org_id=? AND EXISTS(SELECT 1 FROM audit WHERE id=?)',a.delivery?'complete':projected.dispatch?'in_progress':'initiated',a.consignment_id,org,audit)):[]),
      ]);
      if(!result[0].results?.length)throw new AppError('This trip or your access changed, or the truck is unavailable. Reload before continuing.',409);
    }catch(error){
      let committed:Row|null;try{committed=await s.first('SELECT * FROM trip_events WHERE id=? AND org_id=?',id,org);}catch{throw new AppError('Event outcome is unavailable. Retry the same event and request.',503);}
      if(committed){if(matches(committed))return {success:true,id,alreadyRecorded:true};throw new AppError('This request ID was used with different event details.',409);}
      throw error;
    }
    return {success:true,id};
  }
}
