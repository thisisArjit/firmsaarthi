import {test} from 'vitest';
import assert from 'node:assert/strict';
import {tripStageSummary} from '../lib/trip-stage-summary';
import {database} from './helpers/database';
import {TransportService} from '../lib/service';
import {TripService} from '../lib/trip-service';
import {WorkspaceStagePolicies} from '../lib/workspace-stage-policy';
import {TripStageDocuments} from '../lib/trip-stage-documents';
import {TripStageReviews} from '../lib/trip-stage-reviews';

const optional={version:1,placement:'optional',loading:'optional',arrival:'optional'},required={version:1,placement:'accepted_file',loading:'accepted_file',arrival:'accepted_file'};
function model(strict=false){return {trip:{id:'trip',org_id:'org',status:'planned',creation_payload:JSON.stringify({stagePolicyRequest:{contract:'workspace_stage_v1',version:1},stagePolicySnapshot:{version:1,policy:strict?required:optional}})},allocations:[{id:'a',active:1},{id:'b',active:1}],events:[] as any[]};}
function event(m:ReturnType<typeof model>,kind:string,allocationId:string|null=null,target:string|null=null){const id='event-'+(m.events.length+1);m.events.push({id,org_id:'org',trip_id:'trip',kind,allocation_id:allocationId,target_event_id:target,event_at:'2026-10-27T00:00:00.000Z',recorded_at:'2026-10-27T00:01:00.000Z'});return id;}

test('legacy projections stay absent and explicit opt-in requirements remain immutable',()=>{
 assert.equal(tripStageSummary({creation_payload:'{}'},[],[],[]),undefined);const m=model(),before=JSON.stringify(m),summary=tripStageSummary(m.trip,m.allocations,m.events,[])!;assert.equal(summary.sourceVersion,1);assert.equal(summary.provenance,'manual');assert.equal(JSON.stringify(m),before);assert.ok(Object.isFrozen(summary));assert.ok(Object.isFrozen(summary.policy));assert.ok(Object.isFrozen(summary.items));assert.deepEqual(summary.nextActions,[{kind:'placement',allocationId:null,label:'Record placement',blocked:false,reason:null}]);assert.equal(tripStageSummary(m.trip,m.allocations,m.events,[{stage:'placement',allocation_id:null,accepted:1}])!.placement.fileAccepted,false);
});

test('physical next actions preserve optional milestones and partial allocation progress',()=>{
 const m=model();event(m,'placement');assert.deepEqual(tripStageSummary(m.trip,m.allocations,m.events,[])!.nextActions.map(a=>[a.kind,a.allocationId]),[['loading','a'],['loading','b']]);event(m,'loading','a');assert.deepEqual(tripStageSummary(m.trip,m.allocations,m.events,[])!.nextActions.map(a=>a.allocationId),['b']);event(m,'loading','b');assert.equal(tripStageSummary(m.trip,m.allocations,m.events,[])!.nextActions[0].kind,'dispatch');event(m,'dispatch');m.trip.status='dispatched';event(m,'arrival','a');assert.deepEqual(tripStageSummary(m.trip,m.allocations,m.events,[])!.nextActions.map(a=>[a.kind,a.allocationId]),[['delivery','a'],['arrival','b']]);event(m,'delivery','a');event(m,'arrival','b');event(m,'delivery','b');assert.deepEqual(tripStageSummary(m.trip,m.allocations,m.events,[])!.nextActions,[]);
});

test('required-file flags block only the matching next action and disclose no proof metadata',()=>{
 const m=model(true),blocked=tripStageSummary(m.trip,m.allocations,m.events,[])!;assert.equal(blocked.nextActions[0].blocked,true);assert.equal(blocked.nextActions[0].reason,'Owner-accepted placement file required.');const proof={stage:'placement',allocation_id:null,accepted:1};assert.equal(tripStageSummary(m.trip,m.allocations,m.events,[proof])!.nextActions[0].blocked,false);event(m,'placement');const summary=tripStageSummary(m.trip,m.allocations,m.events,[proof,{stage:'loading',allocation_id:'a',accepted:1}])!;assert.equal(summary.nextActions[0].blocked,false);assert.equal(summary.nextActions[1].blocked,true);assert.doesNotMatch(JSON.stringify(summary),/documentId|reviewId|sha256|filename|asset_id/);assert.deepEqual(Object.keys(summary.placement).sort(),['recorded','eventId','actualAt','recordedAt','fileRequired','fileAccepted'].sort());
});

test('corrected milestones disappear from current readiness while terminal history stays readable',()=>{
 const m=model(),placed=event(m,'placement'),loaded=event(m,'loading','a');event(m,'correction',null,loaded);assert.equal(tripStageSummary(m.trip,m.allocations,m.events,[])!.items[0].loading.recorded,false);event(m,'correction',null,placed);assert.equal(tripStageSummary(m.trip,m.allocations,m.events,[])!.nextActions[0].kind,'placement');m.trip.status='cancelled';m.allocations=m.allocations.map(a=>({...a,active:0}));assert.deepEqual(tripStageSummary(m.trip,m.allocations,m.events,[])!.nextActions,[]);assert.equal(tripStageSummary(m.trip,m.allocations,m.events,[])!.items.length,2);
});

test('malformed source, ambiguous stage history and foreign proof slots fail closed',()=>{
 const m=model();for(const payload of [{stagePolicyRequest:{contract:'other'},stagePolicySnapshot:{version:1,policy:optional}},{stagePolicyRequest:{contract:'workspace_stage_v1'},stagePolicySnapshot:{version:0,policy:optional}}])assert.throws(()=>tripStageSummary({...m.trip,creation_payload:JSON.stringify(payload)},m.allocations,[],[]));event(m,'placement');assert.throws(()=>tripStageSummary(m.trip,m.allocations,[{...m.events[0],org_id:'foreign'}],[]),/scoped/);assert.throws(()=>tripStageSummary(m.trip,m.allocations,[...m.events,{...m.events[0],id:'other'}],[]),/unambiguous/);for(const proof of [{stage:'loading',allocation_id:'foreign',accepted:1},{stage:'placement',allocation_id:'a',accepted:1},{stage:'pod',allocation_id:null,accepted:1},{stage:'arrival',allocation_id:'a',accepted:2}])assert.throws(()=>tripStageSummary(m.trip,m.allocations,m.events,[proof]),/readiness/);
});

async function fixture(strict=false){const {db,sqlite}=database(),owner=new TransportService(db,{userId:'summary-owner',email:'owner@summary.test'});await owner.command('workspace.create',{name:'Synthetic summary company'});const org=(await owner.member()).org_id;await owner.command('consignment.save',{year:'2026-2027',cn:'SUMMARY',date:'2026-10-26',company:'Synthetic customer',truck:'BR01AB1234',origin:'Patna',destination:'Delhi',freight:1000,advance:0});const c=(await owner.state('2026-2027')).consignments[0],supplier=await owner.command('account.save',{kind:'supplier',code:'SUMMARY',name:'Synthetic supplier'}),policies=new WorkspaceStagePolicies(owner);await policies.save(strict?required:optional,0);const trip=await owner.command('trip.create',{consignmentId:c.id,supplierId:supplier.id,registration:c.truck,stagePolicy:'workspace_v1',stagePolicyVersion:1,requestId:'summary-trip'}),allocationId=(await owner.first('SELECT id FROM trip_allocations WHERE trip_id=?',trip.id))!.id,objects=new Map<string,Uint8Array>(),bucket={put:async(k:string,b:Uint8Array)=>{objects.set(k,b.slice());},delete:async(k:string)=>{objects.delete(k);}} as unknown as R2Bucket;
 const write=async(kind:string)=>owner.command('trip.event',{tripId:trip.id,kind,...(kind==='loading'?{allocationId}:{}),version:(await owner.owned('trips',trip.id,org)).version,eventAt:new Date().toISOString(),requestId:'summary-event-'+kind});
 const accept=async()=>{const uploaded=await new TripStageDocuments(owner).upload({tripId:trip.id,stage:'placement',version:1,requestId:'summary-placement-file'},{name:'Private synthetic.pdf',type:'application/pdf',bytes:new TextEncoder().encode('%PDF-1.4 summary')},bucket);await new TripStageReviews(owner).record({tripId:trip.id,documentId:uploaded.id,kind:'accept',version:2,eventAt:new Date().toISOString(),note:'',requestId:'summary-placement-review'});};
 return {db,sqlite,owner,org,trip,allocationId,objects,bucket,policies,write,accept};}

test('operational DTOs expose readiness flags without private file or review identity',async()=>{
 const f=await fixture(true);try{await f.accept();await f.write('placement');f.sqlite.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').run('summary-dispatcher',f.org,'dispatcher@summary.test','DISPATCHER','2026-10-27');const dispatcher=new TransportService(f.db,{userId:'summary-dispatcher',email:'dispatcher@summary.test'}),dto=await new TripService(dispatcher).detail(f.trip.id);assert.equal(dto.stageWorkflow.placement.recorded,true);assert.equal(dto.stageWorkflow.placement.fileAccepted,true);assert.equal(dto.stageWorkflow.nextActions[0].kind,'loading');assert.equal(dto.stageWorkflow.nextActions[0].blocked,true);assert.equal(dto.trip.creation_payload,undefined);assert.deepEqual(dto.documents,[]);assert.doesNotMatch(JSON.stringify(dto),/stage_doc_|stage_review_|Private synthetic|sha256|stageTransition/);
 }finally{f.objects.clear();f.sqlite.close();}
});

test('a concurrent milestone read retries once and returns its matching current version',async()=>{
 const f=await fixture(),rows=f.owner.rows.bind(f.owner);let reads=0;try{f.owner.rows=async(sql:string,...args:any[])=>{const result=await rows(sql,...args);if(sql.startsWith('SELECT * FROM trip_events')&&++reads===1)await f.write('placement');return result;};const dto=await new TripService(f.owner).detail(f.trip.id);assert.equal(reads,2);assert.equal(dto.trip.version,2);assert.equal(dto.events.length,1);assert.equal(dto.stageWorkflow.placement.recorded,true);
 }finally{f.owner.rows=rows;f.objects.clear();f.sqlite.close();}
});

test('mid-read owner loss retries with the new role and never returns captured private proof links',async()=>{
 const f=await fixture(true),rows=f.owner.rows.bind(f.owner);let changed=false;try{await f.accept();await f.write('placement');f.owner.rows=async(sql:string,...args:any[])=>{const result=await rows(sql,...args);if(sql.startsWith('SELECT * FROM trip_events')&&!changed){changed=true;f.sqlite.prepare("UPDATE memberships SET role='MEMBER' WHERE user_id='summary-owner'").run();}return result;};const dto=await new TripService(f.owner).detail(f.trip.id);assert.equal(dto.owner,false);assert.equal(dto.stageWorkflow.placement.fileAccepted,true);assert.deepEqual(dto.documents,[]);assert.doesNotMatch(JSON.stringify(dto),/stage_doc_|stage_review_|Private synthetic|sha256|stageTransition/);
 }finally{f.owner.rows=rows;f.objects.clear();f.sqlite.close();}
});

test('repeated concurrent claims return an explicit conflict instead of an unbounded retry',async()=>{
 const f=await fixture(),rows=f.owner.rows.bind(f.owner);let reads=0;try{f.owner.rows=async(sql:string,...args:any[])=>{const result=await rows(sql,...args);if(sql.startsWith('SELECT * FROM trip_events')){reads++;await f.write(reads===1?'placement':'loading');}return result;};await assert.rejects(new TripService(f.owner).detail(f.trip.id),(e:any)=>e.status===409&&/changed while loading/.test(e.message));assert.equal(reads,2);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trip_events').get()!.n,2);
 }finally{f.owner.rows=rows;f.objects.clear();f.sqlite.close();}
});

test('current stage defaults are available for planning without changing existing timeline rules',async()=>{
 const f=await fixture();try{await f.policies.save(required,1);const state=await new TripService(f.owner).state(),dto=await new TripService(f.owner).detail(f.trip.id);assert.equal(state.stageDefault.version,2);assert.equal(state.stageDefault.policy.placement,'accepted_file');assert.equal(dto.stageWorkflow.sourceVersion,1);assert.equal(dto.stageWorkflow.policy.placement,'optional');assert.equal(dto.stageWorkflow.nextActions[0].blocked,false);
 }finally{f.objects.clear();f.sqlite.close();}
});
