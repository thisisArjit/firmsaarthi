import {stageTransitionSnapshot,type StageTransitionContext,type StageTransitionEvent} from './trip-stage-transition';

export type PodFile={id:string;orgId:string;tripId:string;allocationId:string;purpose:'trip_pod'|'trip_stage'|'operational';createdAt:string};
export type TripFollowUpContext=StageTransitionContext&{actorRole:string;podPolicy:'reference_v1'|'file_v1';podDocuments:readonly PodFile[];podReviewLinks:readonly {eventId:string;documentId:string}[]};
export type TripFollowUpRequest={kind:'pod_accept'|'pod_reject'|'exception'|'exception_resolve'|'close'|'correction';allocationId:string|null;targetId:string|null;eventAt:string;reference:string;note:string;documentId:string|null};

/** Pure trusted-snapshot plan; the opt-in transaction service supplies authority and SQL writes. */
export function planTripFollowUp(c:TripFollowUpContext,r:TripFollowUpRequest){
  const {created,recorded,active,find,dispatch,status,allocations}=stageTransitionSnapshot(c);
  if(!['OWNER','MEMBER','DISPATCHER'].includes(c.actorRole))throw new Error('This account cannot record trip events.');
  if(!['pod_accept','pod_reject','exception','exception_resolve','close','correction'].includes(r.kind))throw new Error('Choose a supported follow-up event.');
  if(['pod_accept','pod_reject','close','correction'].includes(r.kind)&&c.actorRole!=='OWNER')throw new Error('Only the owner can review POD, close or correct trips.');
  if(!['reference_v1','file_v1'].includes(c.podPolicy))throw new Error('Reload the saved POD requirement.');
  if(typeof r.eventAt!=='string'||!Number.isFinite(Date.parse(r.eventAt))||new Date(r.eventAt).toISOString()!==r.eventAt||r.eventAt<created||r.eventAt>recorded)throw new Error('Choose a valid actual follow-up time.');
  if(typeof r.note!=='string'||r.note.length>500||typeof r.reference!=='string'||r.reference.length>200)throw new Error('Use valid reference and reason details.');
  const scoped=['pod_accept','pod_reject'].includes(r.kind);
  if(scoped?!r.allocationId||!allocations.has(r.allocationId):r.allocationId!==null)throw new Error('Choose the correct trip or consignment scope.');
  if(!['correction','exception_resolve'].includes(r.kind)&&r.targetId!==null)throw new Error('This event cannot target another event.');
  if(r.documentId!==null&&!scoped)throw new Error('A POD file belongs only to a POD review.');
  if(r.documentId!==null&&(typeof r.documentId!=='string'||!r.documentId||r.documentId.length>200))throw new Error('Choose a valid POD file.');
  const docs=new Map<string,PodFile>(),links=new Map<string,string>();
  for(const doc of c.podDocuments){if(!doc.id||docs.has(doc.id)||!Number.isFinite(Date.parse(doc.createdAt))||new Date(doc.createdAt).toISOString()!==doc.createdAt)throw new Error('Reload unambiguous POD file history.');docs.set(doc.id,doc);}
  for(const link of c.podReviewLinks){if(!link.eventId||!link.documentId||links.has(link.eventId))throw new Error('Reload unambiguous POD review links.');links.set(link.eventId,link.documentId);}
  const validFile=(documentId:string,event:Pick<StageTransitionEvent,'allocationId'|'eventAt'>)=>{const doc=docs.get(documentId);return !!doc&&doc.orgId===c.orgId&&doc.tripId===c.tripId&&doc.allocationId===event.allocationId&&doc.purpose==='trip_pod'&&doc.createdAt<=event.eventAt;};
  // Existing private file requirements cannot be satisfied by an operational/stage attachment.
  for(const event of active.filter(e=>e.kind==='pod_accept'||e.kind==='pod_reject')){
    const delivery=find('delivery',event.allocationId);
    if(!dispatch||!delivery||event.eventAt<delivery.eventAt||event.version<=delivery.version)throw new Error('Reload valid original POD delivery history.');
    const documentId=links.get(event.id);if(documentId&&!validFile(documentId,event)||event.kind==='pod_accept'&&c.podPolicy==='file_v1'&&!documentId)throw new Error('An active POD review has missing or mismatched original file evidence.');
  }
  const resolutionTargets=new Set<string>();
  for(const event of active.filter(e=>e.kind==='exception'||e.kind==='exception_resolve')){
    if(!dispatch||event.eventAt<dispatch.eventAt||event.version<=dispatch.version)throw new Error('Reload valid exception departure history.');
    if(event.kind==='exception_resolve'){
      const target=active.find(e=>e.id===event.targetId&&e.kind==='exception');
      if(!target||resolutionTargets.has(target.id)||event.eventAt<target.eventAt||event.version<=target.version)throw new Error('Reload valid original exception resolution history.');
      resolutionTargets.add(target.id);
    }
  }
  const need=new Set<string>(),after=(event:StageTransitionEvent|null,message:string)=>{if(!event)throw new Error(message);if(r.eventAt<event.eventAt)throw new Error('Follow-up time cannot precede its prerequisite.');need.add(event.id);};
  let nextStatus=status;
  if(r.kind==='correction'){
    const target=active.find(e=>e.id===r.targetId);
    if(!r.note.trim()||!target||!['dispatch','delivery','pod_accept','pod_reject','exception','exception_resolve','close'].includes(target.kind)||active.at(-1)?.id!==target.id)throw new Error('Give a reason and correct the latest active follow-up event first.');
    if(status==='cancelled'||status==='closed'&&target.kind!=='close')throw new Error('Correct closure before earlier progress.');
    after(target,'Choose an active event to correct.');
    nextStatus=target.kind==='close'?'dispatched':target.kind==='dispatch'?'planned':status;
  }else{
    if(status!=='dispatched')throw new Error('Record departure and reopen any closure before follow-up events.');
    after(dispatch,'Record departure before follow-up events.');
    if(scoped){
      const delivery=find('delivery',r.allocationId);after(delivery,'Record this consignment’s delivery before POD review.');
      const previous=active.filter(e=>e.allocationId===r.allocationId&&['pod_accept','pod_reject'].includes(e.kind)).at(-1);
      if(previous){after(previous,'Reload the previous POD decision.');if(r.kind==='pod_accept'&&previous.kind==='pod_accept')throw new Error('Correct or reject the current acceptance first.');}
      if(r.kind==='pod_accept'&&!r.reference.trim())throw new Error('Give a POD / receiver reference.');
      if(r.kind==='pod_reject'&&!r.note.trim())throw new Error('Give a POD rejection reason.');
      if(r.documentId&&!validFile(r.documentId,{allocationId:r.allocationId,eventAt:r.eventAt}))throw new Error('Choose an uploaded POD file for this trip and consignment.');
      if(r.kind==='pod_accept'&&c.podPolicy==='file_v1'&&!r.documentId)throw new Error('An uploaded private POD file is required.');
    }else if(r.kind==='exception'){
      if(!r.note.trim())throw new Error('Give the exception details.');
    }else if(r.kind==='exception_resolve'){
      const target=active.find(e=>e.id===r.targetId&&e.kind==='exception');
      if(!target||active.some(e=>e.kind==='exception_resolve'&&e.targetId===target.id)||!r.note.trim())throw new Error('Choose an unresolved exception and give resolution details.');after(target,'Choose an unresolved exception.');
    }else{
      const resolved=new Set(active.filter(e=>e.kind==='exception_resolve').map(e=>e.targetId));
      if(active.some(e=>e.kind==='exception'&&!resolved.has(e.id)))throw new Error('Resolve open exceptions before closing.');
      for(const allocation of allocations.keys()){
        after(find('delivery',allocation),'Deliver every active consignment before closing.');
        const pod=active.filter(e=>e.allocationId===allocation&&['pod_accept','pod_reject'].includes(e.kind)).at(-1);
        if(pod?.kind!=='pod_accept')throw new Error('Accept POD for every active consignment before closing.');
        if(c.podPolicy==='file_v1'&&(!links.has(pod.id)||!validFile(links.get(pod.id)!,pod)))throw new Error('Accept each consignment’s uploaded POD file before closing.');
      }
      for(const event of active)after(event,'Reload the latest active trip event.');nextStatus='closed';
    }
  }
  return Object.freeze({kind:r.kind,allocationId:r.allocationId,targetId:r.targetId,eventAt:r.eventAt,reference:r.reference,note:r.note,documentId:r.documentId,status:nextStatus,prerequisiteEventIds:Object.freeze([...need].sort())});
}
