import {test} from 'vitest';
import assert from 'node:assert/strict';
import {planStageTransition,type StageTransitionContext,type StageTransitionRequest,type ReviewedStageFile} from '../lib/trip-stage-transition';

const stamp=(hour:number)=>`2026-10-27T${String(hour).padStart(2,'0')}:00:00.000Z`;
function context(required=false):StageTransitionContext{return {orgId:'org',tripId:'trip',version:1,status:'planned',createdAt:stamp(0),recordedAt:stamp(20),allocations:[{id:'a',bookingAt:'2026-10-26T18:30:00.000Z'},{id:'b',bookingAt:'2026-10-26T18:30:00.000Z'}],policy:{version:1,placement:required?'accepted_file':'optional',loading:required?'accepted_file':'optional',arrival:required?'accepted_file':'optional'},events:[],documents:[]};}
const request=(kind:StageTransitionRequest['kind'],allocationId:string|null=null,hour=1,targetId:string|null=null):StageTransitionRequest=>({kind,allocationId,targetId,eventAt:stamp(hour)});
function add(c:StageTransitionContext,r:StageTransitionRequest){const plan=planStageTransition(c,r),version=++c.version,id='event-'+version;c.events=[...c.events,{id,orgId:c.orgId,tripId:c.tripId,kind:r.kind,allocationId:r.allocationId,targetId:r.targetId,eventAt:r.eventAt,version,evidenceUses:plan.evidenceUses}];if(r.kind==='dispatch')c.status='dispatched';return {id,plan};}
function file(stage:'placement'|'loading'|'arrival',allocationId:string|null,suffix=''):ReviewedStageFile{const id=`file-${stage}-${allocationId||'trip'}${suffix}`;return {id,orgId:'org',tripId:'trip',purpose:'trip_stage',stage,allocationId,review:{id:'review-'+id,decision:'accept',actorRoleAtReview:'OWNER',corrected:false}};}
function load(c:StageTransitionContext){const placement=add(c,request('placement',null,1)),a=add(c,request('loading','a',2)),b=add(c,request('loading','b',3));return {placement,a,b};}

test('optional files retain physical placement/loading/arrival prerequisites for every consignment',()=>{
 const c=context();assert.throws(()=>planStageTransition(c,request('loading','a',2)),/placement/);assert.throws(()=>planStageTransition(c,request('dispatch',null,4)),/placement/);
 const placement=add(c,request('placement')),a=add(c,request('loading','a',2));assert.throws(()=>planStageTransition(c,request('dispatch',null,4)),/every active consignment/);const b=add(c,request('loading','b',3)),departure=add(c,request('dispatch',null,4));assert.deepEqual(departure.plan.prerequisiteEventIds,[placement.id,a.id,b.id].sort());assert.deepEqual(departure.plan.evidenceUses,[]);
 assert.throws(()=>planStageTransition(c,request('delivery','a',6)),/arrival/);const arrivalA=add(c,request('arrival','a',5));assert.deepEqual(arrivalA.plan.prerequisiteEventIds,[a.id,departure.id].sort());const deliveryA=add(c,request('delivery','a',6));assert.ok(deliveryA.plan.prerequisiteEventIds.includes(arrivalA.id));assert.throws(()=>planStageTransition(c,request('delivery','b',6)),/arrival/);add(c,request('arrival','b',7));add(c,request('delivery','b',8));assert.equal(c.events.filter(e=>e.kind==='delivery').length,2);
});

test('required stage plans bind one deterministic exact owner review for the matching scope',()=>{
 const c=context(true);assert.throws(()=>planStageTransition(c,request('placement')),/owner-accepted placement/);const p=file('placement',null),alternate=file('placement',null,'-z');c.documents=[alternate,p,file('loading','a'),file('loading','b'),file('arrival','a'),file('arrival','b')];const placed=add(c,request('placement'));assert.deepEqual(placed.plan.evidenceUses,[{documentId:p.id,reviewId:p.review!.id}]);
 add(c,request('loading','a',2));add(c,request('loading','b',3));add(c,request('dispatch',null,4));const arrival=add(c,request('arrival','b',5));assert.deepEqual(arrival.plan.evidenceUses,[{documentId:'file-arrival-b',reviewId:'review-file-arrival-b'}]);
 const activeOriginal=c.documents.find(d=>d.id===p.id)!;activeOriginal.review={...activeOriginal.review!,corrected:true};assert.throws(()=>planStageTransition(c,request('delivery','b',6)),/original evidence/); // Another accepted placement file cannot rewrite the earlier event's link.
});

test('pending, rejected, corrected, wrong-role and foreign-purpose files never satisfy a required stage',()=>{
 for(const change of [{review:null},{review:{...file('placement',null).review!,decision:'reject'}},{review:{...file('placement',null).review!,corrected:true}},{review:{...file('placement',null).review!,actorRoleAtReview:'MEMBER'}},{orgId:'foreign'},{tripId:'foreign'},{purpose:'trip_pod'},{purpose:'operational'},{allocationId:'a'},{stage:'arrival'}]){
  const c=context(true);c.documents=[{...file('placement',null),...change} as ReviewedStageFile];assert.throws(()=>planStageTransition(c,request('placement')),/owner-accepted placement/);
 }
 const c=context(true);c.documents=[file('placement',null),file('loading','a')];add(c,request('placement'));add(c,request('loading','a',2));assert.throws(()=>planStageTransition(c,request('loading','b',3)),/this consignment/);
});

test('event times reject future, pre-trip, pre-booking and prerequisite reversals',()=>{
 const c=context();assert.throws(()=>planStageTransition(c,{...request('placement'),eventAt:'2026-10-26T23:59:59.000Z'}),/trip creation/);assert.throws(()=>planStageTransition(c,request('placement',null,21)),/future/);assert.throws(()=>planStageTransition(c,{...request('placement'),eventAt:'2026-10-27'}),/valid stage event/);
 c.allocations=[{id:'a',bookingAt:stamp(2)}];assert.throws(()=>planStageTransition(c,request('placement')),/consignment date/);add(c,request('placement',null,3));assert.throws(()=>planStageTransition(c,request('loading','a',2)),/prerequisite/);add(c,request('loading','a',4));assert.throws(()=>planStageTransition(c,request('dispatch',null,3)),/prerequisite/);add(c,request('dispatch',null,5));assert.throws(()=>planStageTransition(c,request('arrival','a',4)),/prerequisite/);add(c,request('arrival','a',6));assert.throws(()=>planStageTransition(c,request('delivery','a',5)),/prerequisite/);
});

test('physical corrections require reversing descendants while unrelated consignments remain independent',()=>{
 const c=context(),loaded=load(c);assert.throws(()=>planStageTransition(c,request('correction',null,4,loaded.placement.id)),/dependent/);
 add(c,request('correction',null,4,loaded.a.id)); // Loading B is not a descendant of loading A.
 assert.throws(()=>planStageTransition(c,request('dispatch',null,5)),/every active consignment/);add(c,request('loading','a',5));add(c,request('dispatch',null,6));const arrived=add(c,request('arrival','a',7));assert.throws(()=>planStageTransition(c,request('correction',null,8,loaded.b.id)),/dependent/);
 const delivered=add(c,request('delivery','a',8));assert.throws(()=>planStageTransition(c,request('correction',null,9,arrived.id)),/dependent/);
 // Existing delivery reversal is supplied as trusted historical input; this planner handles stage corrections only.
 c.events=[...c.events,{id:'reverse-delivery',orgId:c.orgId,tripId:c.tripId,version:++c.version,kind:'correction',allocationId:null,targetId:delivered.id,eventAt:stamp(9)}];
 add(c,request('correction',null,10,arrived.id));assert.equal(c.status,'dispatched');assert.throws(()=>planStageTransition(c,request('delivery','a',11)),/arrival/);add(c,request('arrival','a',11));
 assert.throws(()=>planStageTransition(c,request('correction',null,12,arrived.id)),/active placement/);assert.throws(()=>planStageTransition(c,request('correction',null,1,c.events.at(-1)!.id)),/original stage/);
});

test('ambiguous identities, phases, scopes and active history fail closed',()=>{
 const c=context();for(const changed of [{version:0},{orgId:''},{allocations:[]},{allocations:[c.allocations[0],c.allocations[0]]},{status:'dispatched'},{policy:{version:1}}])assert.throws(()=>planStageTransition({...c,...changed} as StageTransitionContext,request('placement')));
 assert.throws(()=>planStageTransition(c,request('placement','a')),/scope/);assert.throws(()=>planStageTransition(c,request('loading','foreign')),/scope/);assert.throws(()=>planStageTransition(c,request('placement',null,1,'unexpected')),/Only corrections/);
 const p=add(c,request('placement'));assert.throws(()=>planStageTransition(c,request('placement',null,2)),/already recorded/);const event=c.events[0];
 for(const changed of [{orgId:'foreign'},{tripId:'foreign'},{version:c.version+1},{targetId:'unexpected'},{eventAt:stamp(21)},{kind:'fake'},{allocationId:'a'}])assert.throws(()=>planStageTransition({...c,events:[{...event,...changed}]},request('loading','a',2)));
 assert.throws(()=>planStageTransition({...c,events:[event,{...event,id:'duplicate',version:event.version}]},request('loading','a',2)),/unambiguous/);assert.throws(()=>planStageTransition({...c,events:[event,{...event,id:'duplicate',version:3}],version:3},request('loading','a',2)),/unambiguous/);
 assert.throws(()=>planStageTransition(c,request('correction',null,2,'unknown')),/active placement/);assert.ok(p.id);
});

test('invalid prerequisite history and corrected original links cannot be papered over by a new request',()=>{
 const c=context(),loaded=load(c);add(c,request('dispatch',null,4));const event=c.events.find(e=>e.id===loaded.a.id)!;
 assert.throws(()=>planStageTransition({...c,events:c.events.filter(e=>e.id!==event.id)},request('arrival','a',5)),/prerequisite history/);
 assert.throws(()=>planStageTransition({...c,events:c.events.map(e=>e.id===event.id?{...e,eventAt:stamp(0)}:e)},request('arrival','a',5)),/prerequisite history/);
 const required=context(true);required.documents=[file('placement',null),file('loading','a'),file('loading','b')];load(required);const original=required.events[0];assert.throws(()=>planStageTransition({...required,events:required.events.map(e=>e.id===original.id?{...e,evidenceUses:[{documentId:'file-placement-trip',reviewId:'other-review'}]}:e)},request('dispatch',null,4)),/original evidence/);
});

test('planning is immutable, deterministic and contains no financial, role or write authority',()=>{
 const c=context(true);c.documents=[file('placement',null,'-z'),file('placement',null)];const r=request('placement'),before=JSON.stringify({c,r}),plan=planStageTransition(c,r);assert.equal(JSON.stringify({c,r}),before);assert.ok(Object.isFrozen(plan));assert.ok(Object.isFrozen(plan.evidenceUses));assert.ok(Object.isFrozen(plan.evidenceUses[0]));assert.deepEqual(Object.keys(plan).sort(),['kind','allocationId','targetId','eventAt','prerequisiteEventIds','evidenceUses'].sort());assert.deepEqual(plan,planStageTransition({...c,documents:[...c.documents].reverse()},r));
 assert.throws(()=>planStageTransition({...c,documents:[c.documents[0],c.documents[0]]},r),/unambiguous file/);assert.throws(()=>planStageTransition({...c,documents:[c.documents[0],{...c.documents[1],review:c.documents[0].review}]},r),/unambiguous exact-file/);
});
