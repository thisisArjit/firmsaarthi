import {test} from 'vitest';
import assert from 'node:assert/strict';
import {planStageTransition,type StageTransitionRequest} from '../lib/trip-stage-transition';
import {planTripFollowUp,type TripFollowUpContext,type TripFollowUpRequest,type PodFile} from '../lib/trip-follow-up';

const at=(hour:number)=>`2026-10-27T${String(hour).padStart(2,'0')}:00:00.000Z`;
function fixture(file=false):TripFollowUpContext{
 const c:TripFollowUpContext={orgId:'org',tripId:'trip',version:1,status:'planned',createdAt:at(0),recordedAt:at(20),allocations:[{id:'a',bookingAt:at(0)},{id:'b',bookingAt:at(0)}],policy:{version:1,placement:'optional',loading:'optional',arrival:'optional'},events:[],documents:[],actorRole:'OWNER',podPolicy:file?'file_v1':'reference_v1',podDocuments:[],podReviewLinks:[]};
 for(const [kind,allocationId,hour]of [['placement',null,1],['loading','a',2],['loading','b',3],['dispatch',null,4],['arrival','a',5],['delivery','a',6],['arrival','b',7],['delivery','b',8]] as const){const r={kind,allocationId,targetId:null,eventAt:at(hour)} as StageTransitionRequest,p=planStageTransition(c,r);c.events=[...c.events,{id:'e'+(++c.version),orgId:c.orgId,tripId:c.tripId,version:c.version,kind,allocationId,targetId:null,eventAt:r.eventAt,evidenceUses:p.evidenceUses}];if(kind==='dispatch')c.status='dispatched';}
 return c;
}
const request=(kind:TripFollowUpRequest['kind'],allocationId:string|null=null,hour=9,extra:Partial<TripFollowUpRequest>={}):TripFollowUpRequest=>({kind,allocationId,targetId:null,eventAt:at(hour),reference:'',note:'',documentId:null,...extra});
function add(c:TripFollowUpContext,r:TripFollowUpRequest){const plan=planTripFollowUp(c,r),id='e'+(++c.version);c.events=[...c.events,{id,orgId:c.orgId,tripId:c.tripId,version:c.version,kind:r.kind,allocationId:r.allocationId,targetId:r.targetId,eventAt:r.eventAt}];if(r.documentId)c.podReviewLinks=[...c.podReviewLinks,{eventId:id,documentId:r.documentId}];c.status=plan.status;return {id,plan};}
function pod(allocationId:string):PodFile{return {id:'pod-'+allocationId,orgId:'org',tripId:'trip',allocationId,purpose:'trip_pod',createdAt:at(8)};}

test('reference POD closure waits for every latest acceptance and resolved exceptions',()=>{
 const c=fixture();assert.throws(()=>planTripFollowUp(c,request('close')),/Accept POD/);const exception=add(c,request('exception',null,9,{note:'Receiver unavailable'}));add(c,request('pod_accept','a',10,{reference:'Receiver A'}));add(c,request('pod_accept','b',11,{reference:'Receiver B'}));assert.throws(()=>planTripFollowUp(c,request('close',null,12)),/Resolve open exceptions/);add(c,request('exception_resolve',null,12,{targetId:exception.id,note:'Receiver confirmed'}));const closed=add(c,request('close',null,13));assert.equal(closed.plan.status,'closed');assert.equal(closed.plan.prerequisiteEventIds.length,c.events.length-1);assert.throws(()=>planTripFollowUp(c,request('pod_reject','a',14,{note:'Wrong copy'})),/reopen any closure/);
});

test('file POD rules require the exact private POD document and immutable acceptance link',()=>{
 const c=fixture(true);assert.throws(()=>planTripFollowUp(c,request('pod_accept','a',9,{reference:'A'})),/uploaded private POD/);c.podDocuments=[pod('a'),pod('b')];add(c,request('pod_accept','a',9,{reference:'A',documentId:'pod-a'}));add(c,request('pod_accept','b',10,{reference:'B',documentId:'pod-b'}));assert.equal(planTripFollowUp(c,request('close',null,11)).status,'closed');const first=c.podReviewLinks[0];c.podReviewLinks=c.podReviewLinks.filter(r=>r.eventId!==first.eventId);assert.throws(()=>planTripFollowUp(c,request('close',null,11)),/missing or mismatched/);
});

test('operational, stage, foreign tenant/trip/allocation and pre-upload files cannot substitute for POD',()=>{
 for(const change of [{purpose:'operational'},{purpose:'trip_stage'},{orgId:'other'},{tripId:'other'},{allocationId:'b'},{createdAt:at(12)}]){const c=fixture(true);c.podDocuments=[{...pod('a'),...change} as PodFile];assert.throws(()=>planTripFollowUp(c,request('pod_accept','a',9,{reference:'A',documentId:'pod-a'})),/uploaded POD file/);}
 const c=fixture(true);c.podDocuments=[pod('a'),pod('b')];assert.throws(()=>planTripFollowUp(c,request('pod_accept','a',9,{reference:'A',documentId:'pod-b'})),/uploaded POD file/);
});

test('POD decisions require delivery, references/reasons and explicit chronology',()=>{
 const c=fixture();assert.throws(()=>planTripFollowUp(c,request('pod_accept','a')),/reference/);assert.throws(()=>planTripFollowUp(c,request('pod_reject','a')),/rejection reason/);assert.throws(()=>planTripFollowUp(c,request('pod_accept','a',5,{reference:'A'})),/prerequisite/);
 const noDelivery={...c,events:c.events.filter(e=>!(e.kind==='delivery'&&e.allocationId==='a'))};assert.throws(()=>planTripFollowUp(noDelivery,request('pod_accept','a',9,{reference:'A'})),/delivery/);add(c,request('pod_accept','a',9,{reference:'A'}));assert.throws(()=>planTripFollowUp(c,request('pod_accept','a',10,{reference:'Again'})),/Correct or reject/);add(c,request('pod_reject','a',10,{note:'Wrong receipt'}));assert.throws(()=>planTripFollowUp(c,request('close',null,11)),/Accept POD/);add(c,request('pod_accept','a',11,{reference:'Corrected receipt'}));assert.throws(()=>planTripFollowUp(c,request('pod_reject','a',10,{note:'Earlier'})),/prerequisite/);
});

test('owner review/closure/correction authority stays separate from operational exceptions',()=>{
 for(const actorRole of ['MEMBER','DISPATCHER']){const c={...fixture(),actorRole};for(const r of [request('pod_accept','a',9,{reference:'A'}),request('pod_reject','a',9,{note:'Reason'}),request('close'),request('correction',null,9,{targetId:'e9',note:'Reason'})])assert.throws(()=>planTripFollowUp(c,r),/owner/);assert.equal(planTripFollowUp(c,request('exception',null,9,{note:'Delay'})).kind,'exception');}
 assert.throws(()=>planTripFollowUp({...fixture(),actorRole:'OTHER'},request('exception',null,9,{note:'Delay'})),/cannot record/);
});

test('exception resolutions require an active unresolved scoped exception and a reason',()=>{
 const c=fixture();assert.throws(()=>planTripFollowUp(c,request('exception')),/details/);assert.throws(()=>planTripFollowUp(c,request('exception_resolve',null,9,{targetId:'unknown',note:'Reason'})),/unresolved/);const e=add(c,request('exception',null,9,{note:'Delay'}));assert.throws(()=>planTripFollowUp(c,request('exception_resolve',null,10,{targetId:e.id})),/resolution details/);assert.throws(()=>planTripFollowUp(c,request('exception_resolve',null,8,{targetId:e.id,note:'Done'})),/prerequisite/);add(c,request('exception_resolve',null,10,{targetId:e.id,note:'Done'}));assert.throws(()=>planTripFollowUp(c,request('exception_resolve',null,11,{targetId:e.id,note:'Again'})),/unresolved/);
});

test('closure and POD corrections retain history and require the latest active event',()=>{
 const c=fixture(),a=add(c,request('pod_accept','a',9,{reference:'A'})),b=add(c,request('pod_accept','b',10,{reference:'B'}));assert.throws(()=>planTripFollowUp(c,request('correction',null,11,{targetId:a.id,note:'Reason'})),/latest active/);const closed=add(c,request('close',null,11));assert.throws(()=>planTripFollowUp(c,request('correction',null,12,{targetId:b.id,note:'Reason'})),/latest active/);const reversed=add(c,request('correction',null,12,{targetId:closed.id,note:'Reopen'}));assert.equal(c.status,'dispatched');assert.equal(reversed.plan.status,'dispatched');add(c,request('correction',null,13,{targetId:b.id,note:'Wrong acceptance'}));assert.throws(()=>planTripFollowUp(c,request('close',null,14)),/Accept POD/);assert.throws(()=>planTripFollowUp(c,request('correction',null,14,{targetId:reversed.id,note:'Undo correction'})),/latest active/);assert.equal(c.events.filter(e=>e.kind==='correction').length,2);
});

test('latest departure and delivery reversals return the correct phase and reject stage correction targets',()=>{
 const c=fixture();const last=c.events.at(-1)!;assert.equal(planTripFollowUp(c,request('correction',null,9,{targetId:last.id,note:'Wrong delivery'})).status,'dispatched');const departed=c.events.find(e=>e.kind==='dispatch')!,early={...c,events:c.events.filter(e=>e.version<=departed.version),version:departed.version};assert.equal(planTripFollowUp(early,request('correction',null,9,{targetId:departed.id,note:'Wrong departure'})).status,'planned');const placement=c.events.find(e=>e.kind==='placement')!;assert.throws(()=>planTripFollowUp({...c,status:'planned',events:[placement],version:placement.version},request('correction',null,9,{targetId:placement.id,note:'Stage correction belongs to physical planner'})),/latest active/);
});

test('malformed scopes, clocks, links and duplicated documents fail closed without input mutation',()=>{
 const c=fixture(true);c.podDocuments=[pod('a')];for(const r of [request('pod_accept','foreign',9,{reference:'A'}),request('exception','a',9,{note:'Reason'}),request('exception',null,9,{note:'Reason',documentId:'pod-a'}),request('pod_accept','a',9,{reference:'A',targetId:'other'}),request('pod_accept','a',21,{reference:'A'}),request('pod_accept','a',9,{reference:'A',eventAt:'invalid'})])assert.throws(()=>planTripFollowUp(c,r));assert.throws(()=>planTripFollowUp({...c,podDocuments:[pod('a'),pod('a')]},request('pod_reject','a',9,{note:'Reason'})),/unambiguous/);assert.throws(()=>planTripFollowUp({...c,podReviewLinks:[{eventId:'x',documentId:'a'},{eventId:'x',documentId:'b'}]},request('pod_reject','a',9,{note:'Reason'})),/unambiguous/);
 const r=request('pod_accept','a',9,{reference:'A',documentId:'pod-a'}),before=JSON.stringify({c,r}),plan=planTripFollowUp(c,r);assert.equal(JSON.stringify({c,r}),before);assert.ok(Object.isFrozen(plan));assert.ok(Object.isFrozen(plan.prerequisiteEventIds));assert.deepEqual(Object.keys(plan).sort(),['kind','allocationId','targetId','eventAt','reference','note','documentId','status','prerequisiteEventIds'].sort());
});

test('inconsistent original POD and exception dependencies cannot be concealed by a new event',()=>{
 const c=fixture();const accepted=add(c,request('pod_accept','a',9,{reference:'A'}));const missingDelivery={...c,events:c.events.filter(e=>!(e.kind==='delivery'&&e.allocationId==='a'))};assert.throws(()=>planTripFollowUp(missingDelivery,request('exception',null,10,{note:'Delay'})),/original POD delivery history/);assert.ok(accepted.id);
 const x=fixture(),exception=add(x,request('exception',null,9,{note:'Delay'}));add(x,request('exception_resolve',null,10,{targetId:exception.id,note:'Done'}));x.events=[...x.events,{id:'bad-ancestor-correction',orgId:'org',tripId:'trip',version:++x.version,kind:'correction',allocationId:null,targetId:exception.id,eventAt:at(11)}];assert.throws(()=>planTripFollowUp(x,request('exception',null,12,{note:'New'})),/original exception resolution history/);
});
