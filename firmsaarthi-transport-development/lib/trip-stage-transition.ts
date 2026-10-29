import {parseStageEvidencePolicy,type EvidenceStage,type StageEvidenceDocument} from './trip-stage-evidence';

export type StageTransitionEvent={id:string;orgId:string;tripId:string;version:number;kind:string;allocationId:string|null;targetId:string|null;eventAt:string;evidenceUses?:readonly {documentId:string;reviewId:string}[]};
export type ReviewedStageFile=Omit<StageEvidenceDocument,'review'>&{review:null|{id:string;decision:'accept'|'reject';actorRoleAtReview:string;corrected:boolean}};
export type StageTransitionContext={
  orgId:string;tripId:string;version:number;status:'planned'|'dispatched'|'closed'|'cancelled';createdAt:string;recordedAt:string;
  allocations:readonly {id:string;bookingAt:string}[];
  policy:unknown;events:readonly StageTransitionEvent[];documents:readonly ReviewedStageFile[];
};
export type StageTransitionRequest={kind:'placement'|'loading'|'arrival'|'dispatch'|'delivery'|'correction';allocationId:string|null;targetId:string|null;eventAt:string};
export type StageTransitionPlan={kind:StageTransitionRequest['kind'];allocationId:string|null;targetId:string|null;eventAt:string;prerequisiteEventIds:readonly string[];evidenceUses:readonly {documentId:string;reviewId:string}[]};
const stages=['placement','loading','arrival'];
const kinds=[...stages,'dispatch','delivery','pod_accept','pod_reject','exception','exception_resolve','close','cancel','correction'];
function id(v:unknown):v is string{return typeof v==='string'&&v.length>0&&v.length<=200&&v.trim()===v;}
function time(v:string){if(typeof v!=='string'||!Number.isFinite(Date.parse(v))||new Date(v).toISOString()!==v)throw new Error('Reload valid stage event times.');return v;}

/** Pure planner for a trusted, tenant-scoped server snapshot. Not authorization or a database write.
 * SQL linkage, role/version claims, immutable replay and existing POD rules must still be enforced.
 */
export function stageTransitionSnapshot(c:StageTransitionContext){
  const policy=parseStageEvidencePolicy(c.policy);
  if(!id(c.orgId)||!id(c.tripId)||!Number.isSafeInteger(c.version)||c.version<1)throw new Error('Reload this trip.');
  const created=time(c.createdAt),recorded=time(c.recordedAt);
  if(recorded<created)throw new Error('Reload valid trip chronology.');
  const allocations=new Map<string,{id:string;bookingAt:string}>();
  for(const a of c.allocations){if(!id(a.id)||allocations.has(a.id))throw new Error('Reload active consignment allocations.');time(a.bookingAt);allocations.set(a.id,a);}
  if(!allocations.size)throw new Error('This trip needs active consignments.');
  const eventIds=new Map<string,StageTransitionEvent>(),versions=new Set<number>(),corrected=new Set<string>(),events=[...c.events].sort((a,b)=>a.version-b.version);
  for(const e of events){
    if(!id(e.id)||eventIds.has(e.id)||e.orgId!==c.orgId||e.tripId!==c.tripId||!kinds.includes(e.kind)||!Number.isSafeInteger(e.version)||e.version<1||e.version>c.version||versions.has(e.version))throw new Error('Reload unambiguous scoped trip history.');
    const eventAt=time(e.eventAt);if(eventAt<created||eventAt>recorded)throw new Error('Reload valid trip chronology.');
    if(['loading','arrival','delivery','pod_accept','pod_reject'].includes(e.kind)?!e.allocationId||!allocations.has(e.allocationId):e.allocationId!==null)throw new Error('Reload scoped trip allocations.');
    if(e.kind==='correction'){
      const target=e.targetId?eventIds.get(e.targetId):null;
      if(!target||target.kind==='correction'||target.kind==='cancel'||corrected.has(target.id)||eventAt<target.eventAt)throw new Error('Reload valid event corrections.');
      corrected.add(target.id);
    }else if(e.kind==='exception_resolve'){
      if(!e.targetId||eventIds.get(e.targetId)?.kind!=='exception')throw new Error('Reload valid exception history.');
    }else if(e.targetId!==null)throw new Error('Reload valid trip event targets.');
    eventIds.set(e.id,e);versions.add(e.version);
  }
  const active=events.filter(e=>e.kind!=='correction'&&!corrected.has(e.id));
  const find=(kind:string,allocationId:string|null=null)=>{
    const matches=active.filter(e=>e.kind===kind&&e.allocationId===allocationId);
    if(matches.length>1)throw new Error('Reload unambiguous active stage history.');
    return matches[0]||null;
  };
  const placement=find('placement'),dispatch=find('dispatch'),closed=find('close'),cancelled=find('cancel');
  for(const a of allocations.keys())for(const kind of ['loading','arrival','delivery'])find(kind,a);
  const status:StageTransitionContext['status']=cancelled?'cancelled':closed?'closed':dispatch?'dispatched':'planned';
  if(c.status!==status)throw new Error('Reload the current trip phase.');
  const documentIds=new Set<string>(),reviewIds=new Set<string>();
  for(const doc of c.documents){
    if(!id(doc.id)||documentIds.has(doc.id))throw new Error('Reload unambiguous file records.');documentIds.add(doc.id);
    if(doc.review){if(!id(doc.review.id)||reviewIds.has(doc.review.id))throw new Error('Reload unambiguous exact-file reviews.');reviewIds.add(doc.review.id);}
  }
  // Active history must retain its original exact review; another accepted file cannot substitute.
  const prior=(event:StageTransitionEvent,prerequisite:StageTransitionEvent|null)=>{if(!prerequisite||event.eventAt<prerequisite.eventAt||event.version<=prerequisite.version)throw new Error('Reload valid physical prerequisite history.');};
  for(const event of active){
    if(stages.includes(event.kind)){
      const links=event.evidenceUses||[],rule=policy[event.kind as EvidenceStage];
      if(rule==='optional'?links.length!==0:links.length!==1)throw new Error('Reload this stage’s original evidence links.');
      for(const link of links){
        const doc=c.documents.find(d=>d.id===link.documentId&&d.orgId===c.orgId&&d.tripId===c.tripId&&d.purpose==='trip_stage'&&d.stage===event.kind&&d.allocationId===event.allocationId&&d.review?.id===link.reviewId&&d.review.decision==='accept'&&d.review.actorRoleAtReview==='OWNER'&&!d.review.corrected);
        if(!doc)throw new Error('An active stage has missing or corrected original evidence.');
      }
    }
    if(event.kind==='loading')prior(event,placement);
    if(event.kind==='dispatch'){prior(event,placement);for(const a of allocations.keys())prior(event,find('loading',a));}
    if(event.kind==='arrival'){prior(event,dispatch);prior(event,find('loading',event.allocationId));}
    if(event.kind==='delivery'){prior(event,dispatch);prior(event,find('arrival',event.allocationId));}
  }
  return {policy,created,recorded,allocations,events,active,find,placement,dispatch,status};
}

export function planStageTransition(c:StageTransitionContext,r:StageTransitionRequest):StageTransitionPlan{
  const {policy,created,recorded,allocations,active,find,placement,dispatch,status}=stageTransitionSnapshot(c),at=time(r.eventAt);
  if(at<created||at>recorded)throw new Error('Stage time must follow trip creation and cannot be in the future.');
  if(!['placement','loading','arrival','dispatch','delivery','correction'].includes(r.kind))throw new Error('Choose a supported physical stage action.');
  if(status==='closed'||status==='cancelled')throw new Error('Reverse later trip progress before changing physical stages.');
  const needs:string[]=[],uses:{documentId:string;reviewId:string}[]=[];
  const requireEvent=(e:StageTransitionEvent|null,label:string)=>{if(!e)throw new Error(label);if(at<e.eventAt)throw new Error('Stage time cannot precede its prerequisite.');needs.push(e.id);};
  const file=(stage:EvidenceStage,allocationId:string|null)=>{
    if(policy[stage]==='optional')return;
    const accepted=c.documents.filter(d=>d.orgId===c.orgId&&d.tripId===c.tripId&&d.purpose==='trip_stage'&&d.stage===stage&&d.allocationId===allocationId&&d.review?.decision==='accept'&&d.review.actorRoleAtReview==='OWNER'&&!d.review.corrected).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
    const doc=accepted[0];if(!doc)throw new Error(`An owner-accepted ${stage} file is required${allocationId?' for this consignment':''}.`);
    uses.push({documentId:doc.id,reviewId:doc.review!.id});
  };
  if(r.kind==='correction'){
    if(r.allocationId!==null||!r.targetId)throw new Error('Choose the physical stage being corrected.');
    const target=active.find(e=>e.id===r.targetId);if(!target||!stages.includes(target.kind))throw new Error('Choose an active placement, loading or arrival event.');
    if(at<target.eventAt)throw new Error('Correction time cannot precede the original stage.');
    const dependent=active.some(e=>e.id!==target.id&&(
      target.kind==='placement'&&['loading','dispatch','arrival','delivery','pod_accept','pod_reject','close'].includes(e.kind)||
      target.kind==='loading'&&(e.kind==='dispatch'||e.kind==='close'||e.allocationId===target.allocationId&&['arrival','delivery','pod_accept','pod_reject'].includes(e.kind))||
      target.kind==='arrival'&&(e.kind==='close'||e.allocationId===target.allocationId&&['delivery','pod_accept','pod_reject'].includes(e.kind))
    ));
    if(dependent)throw new Error('Reverse dependent trip progress before correcting this stage.');
    needs.push(target.id);
  }else{
    if(r.targetId!==null)throw new Error('Only corrections can target a previous stage.');
    if(['loading','arrival','delivery'].includes(r.kind)?!r.allocationId||!allocations.has(r.allocationId):r.allocationId!==null)throw new Error('Choose the correct trip or consignment scope.');
    if(r.kind==='placement'){
      if(status!=='planned'||placement)throw new Error('Placement is already recorded or this trip has departed.');
      for(const a of allocations.values())if(at<a.bookingAt)throw new Error('Placement time cannot precede a consignment date.');
      file('placement',null);
    }else if(r.kind==='loading'){
      if(status!=='planned'||find('loading',r.allocationId))throw new Error('Loading is already recorded or this trip has departed.');
      requireEvent(placement,'Record placement before loading.');
      if(at<allocations.get(r.allocationId!)!.bookingAt)throw new Error('Loading time cannot precede the consignment date.');
      file('loading',r.allocationId);
    }else if(r.kind==='dispatch'){
      if(status!=='planned')throw new Error('Departure is already recorded.');
      requireEvent(placement,'Record placement before departure.');
      for(const a of [...allocations.keys()].sort())requireEvent(find('loading',a),'Record loading for every active consignment before departure.');
    }else if(r.kind==='arrival'){
      if(status!=='dispatched'||find('arrival',r.allocationId))throw new Error('Arrival needs an active departure and cannot be recorded twice.');
      requireEvent(dispatch,'Record departure before arrival.');requireEvent(find('loading',r.allocationId),'Record this consignment’s loading before arrival.');file('arrival',r.allocationId);
    }else{
      if(status!=='dispatched'||find('delivery',r.allocationId))throw new Error('Delivery needs an active departure and cannot be recorded twice.');
      requireEvent(dispatch,'Record departure before delivery.');requireEvent(find('arrival',r.allocationId),'Record this consignment’s arrival before delivery.');
    }
  }
  return Object.freeze({kind:r.kind,allocationId:r.allocationId,targetId:r.targetId,eventAt:at,prerequisiteEventIds:Object.freeze([...new Set(needs)].sort()),evidenceUses:Object.freeze(uses.map(u=>Object.freeze(u)))});
}
