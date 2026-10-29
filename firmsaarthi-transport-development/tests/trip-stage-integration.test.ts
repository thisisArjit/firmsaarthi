import {test} from 'vitest';
import assert from 'node:assert/strict';
import {database} from './helpers/database';
import {TransportService} from '../lib/service';
import {WorkspaceStagePolicies} from '../lib/workspace-stage-policy';

const required={version:1,placement:'accepted_file',loading:'accepted_file',arrival:'accepted_file'},optional={version:1,placement:'optional',loading:'optional',arrival:'optional'};
async function fixture(){
 const {db,sqlite}=database(),owner=new TransportService(db,{userId:'stage-trip-owner',email:'owner@stage-trip.test'});await owner.command('workspace.create',{name:'Synthetic stage trip business'});const org=(await owner.member()).org_id,supplier=await owner.command('account.save',{kind:'supplier',code:'STAGE-TRIP',name:'Synthetic stage carrier'}),policies=new WorkspaceStagePolicies(owner);
 async function input(cn:string,extra:Record<string,unknown>={}){await owner.command('consignment.save',{year:'2026-2027',cn,date:'2026-10-26',company:'Synthetic customer',truck:'BR01AB1234',origin:'Patna',destination:'Delhi',freight:1000,advance:0});const c=(await owner.state('2026-2027')).consignments.find((c:any)=>c.cn===cn)!;return {consignmentId:c.id,supplierId:supplier.id,registration:c.truck,requestId:'stage-trip-'+cn,...extra};}
 return {db,sqlite,owner,org,supplier,policies,input};
}

test('unconfigured requests stay legacy and original retries survive later stage defaults',async()=>{
 const f=await fixture();try{const input=await f.input('LEGACY'),trip=await f.owner.command('trip.create',input),before=await f.owner.owned('trips',trip.id,f.org);assert.equal(Object.hasOwn(JSON.parse(before.creation_payload),'stagePolicySnapshot'),false);
  await f.policies.save(required,0);assert.equal((await f.owner.command('trip.create',input)).alreadyRecorded,true);assert.deepEqual(await f.owner.owned('trips',trip.id,f.org),before);
  await assert.rejects(f.owner.command('trip.create',await f.input('MISSING-OPT-IN')),/Review the workspace stage/);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trips').get()!.n,1);
 }finally{f.sqlite.close();}
});

test('new opt-in timelines freeze source/effective rules and replay before consulting newer defaults',async()=>{
 const f=await fixture();try{const source=await f.policies.save(required,0),input=await f.input('SNAPSHOT',{stagePolicy:'workspace_v1',stagePolicyVersion:1}),trip=await f.owner.command('trip.create',input),before=await f.owner.owned('trips',trip.id,f.org),payload=JSON.parse(before.creation_payload);
  assert.deepEqual(payload.stagePolicyRequest,{contract:'workspace_stage_v1',version:1});assert.deepEqual(payload.stagePolicySnapshot,{id:source.id,version:1,policy:required});assert.equal(before.pod_policy,'reference_v1');
  await f.policies.save(optional,1);assert.equal((await f.owner.command('trip.create',input)).alreadyRecorded,true);await assert.rejects(f.owner.command('trip.create',{...input,stagePolicyVersion:2}),/different trip details/);assert.deepEqual(await f.owner.owned('trips',trip.id,f.org),before);
  const next=await f.input('STALE',{stagePolicy:'workspace_v1',stagePolicyVersion:1});await assert.rejects(f.owner.command('trip.create',next),/stage evidence policy changed/);const saved=await f.owner.command('trip.create',{...next,stagePolicyVersion:2});assert.deepEqual(JSON.parse((await f.owner.owned('trips',saved.id,f.org)).creation_payload).stagePolicySnapshot.policy,optional);
  assert.throws(()=>f.sqlite.prepare('UPDATE trips SET creation_payload=? WHERE id=?').run('{}',trip.id),/immutable/);const backup=await f.owner.backup();assert.equal(backup.records.workspace_stage_policies.length,2);assert.equal(JSON.parse(backup.records.trips.find((row:any)=>row.id===trip.id).creation_payload).stagePolicySnapshot.id,source.id);
 }finally{f.sqlite.close();}
});

test('operational roles inherit the exact workspace rules without a weakening override',async()=>{
 const f=await fixture();try{await f.policies.save(required,0);
  for(const role of ['MEMBER','DISPATCHER']){const userId='stage-trip-'+role;f.sqlite.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').run(userId,f.org,role+'@stage-trip.test',role,'2026-10-27');const member=new TransportService(f.db,{userId,email:role+'@stage-trip.test'}),input=await f.input(role,{stagePolicy:'workspace_v1',stagePolicyVersion:1}),trip=await member.command('trip.create',input);assert.deepEqual(JSON.parse((await f.owner.owned('trips',trip.id,f.org)).creation_payload).stagePolicySnapshot.policy,required);
   await assert.rejects(member.command('trip.create',await f.input(role+'-WEAK',{stagePolicy:'optional',stagePolicyVersion:1})),/overrides are unavailable/);
   await assert.rejects(member.command('trip.event',{tripId:trip.id,version:1,kind:'dispatch',eventAt:new Date().toISOString(),requestId:'stage-role-gated-'+role}),/placement/);
  }assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trips').get()!.n,2);
 }finally{f.sqlite.close();}
});

test('invalid or forged stage request fields cannot create timelines',async()=>{
 const f=await fixture();try{const input=await f.input('INVALID');await assert.rejects(f.owner.command('trip.create',{...input,stagePolicy:'workspace_v1',stagePolicyVersion:1}),/stage evidence policy changed/);
  await f.policies.save(required,0);
  for(const stagePolicyVersion of [undefined,null,'1',0,-1,1.5,Number.MAX_SAFE_INTEGER+1])await assert.rejects(f.owner.command('trip.create',{...input,stagePolicy:'workspace_v1',stagePolicyVersion}),/Reload/);
  for(const extra of [{stagePolicyVersion:1},{stagePolicy:'reference_v1',stagePolicyVersion:1},{stagePolicySnapshot:{}},{stagePolicyRequest:{}}])await assert.rejects(f.owner.command('trip.create',{...input,...extra}));
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trips').get()!.n,0);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit WHERE action='trip.create'").get()!.n,0);
 }finally{f.sqlite.close();}
});

test('a policy change before serialized creation rolls back trip, allocations and creation audit',async()=>{
 const f=await fixture(),original=f.db.batch;let injected=false;
 try{await f.policies.save(required,0);const input=await f.input('RACE',{stagePolicy:'workspace_v1',stagePolicyVersion:1}),before=f.sqlite.prepare('SELECT * FROM consignments').all();
  f.db.batch=(async statements=>{if(!injected&&statements.some(s=>(s as unknown as {sql:string}).sql.includes('INSERT INTO trips'))){injected=true;await f.policies.save(optional,1);}return original(statements);}) as typeof f.db.batch;
  await assert.rejects(f.owner.command('trip.create',input),/stage evidence policy changed/);assert.equal(injected,true);for(const table of ['trips','trip_allocations','trip_events'])assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM '+table).get()!.n,0);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit WHERE action='trip.create'").get()!.n,0);assert.deepEqual(f.sqlite.prepare('SELECT * FROM consignments').all(),before);assert.equal((await f.policies.current())!.version,2);
 }finally{f.db.batch=original;f.sqlite.close();}
});

test('SQL snapshot guards reject omitted, foreign, changed, stale and unauthorised sources',async()=>{
 const f=await fixture();try{await f.policies.save(required,0);const trip=await f.owner.command('trip.create',await f.input('GUARD',{stagePolicy:'workspace_v1',stagePolicyVersion:1})),row=await f.owner.owned('trips',trip.id,f.org),payload=JSON.parse(row.creation_payload),other=new TransportService(f.db,{userId:'stage-trip-foreign',email:'foreign@stage-trip.test'});await other.command('workspace.create',{name:'Other stage tenant'});const foreign=await new WorkspaceStagePolicies(other).save(required,0);let n=0;
  function clone(value:any,actor=row.created_by){return f.sqlite.prepare("INSERT INTO trips(id,org_id,year,number,vehicle_id,vehicle_snapshot,supplier_party_id,supplier_snapshot,status,version,creation_payload,created_at,created_by,pod_policy) SELECT ?,org_id,year,?,vehicle_id,vehicle_snapshot,supplier_party_id,supplier_snapshot,status,version,?,created_at,?,pod_policy FROM trips WHERE id=?").run('stage-forged-'+(++n),'STAGE-FORGED-'+n,JSON.stringify(value),actor,trip.id);}
  assert.throws(()=>clone({...payload,stagePolicySnapshot:{...payload.stagePolicySnapshot,id:foreign.id}}),/stage policy source/);
  assert.throws(()=>clone({...payload,stagePolicySnapshot:{...payload.stagePolicySnapshot,policy:optional}}),/stage policy source/);
  assert.throws(()=>clone({...payload,stagePolicyRequest:{...payload.stagePolicyRequest,version:2}}),/stage policy source/);
  assert.throws(()=>clone({...payload,stagePolicySnapshot:null}),/stage policy source/);
  const {stagePolicyRequest,stagePolicySnapshot,...legacy}=payload;assert.throws(()=>clone(legacy),/stage policy source/);assert.throws(()=>clone(payload,'stage-trip-foreign'),/stage policy source/);
  await f.policies.save(optional,1);assert.throws(()=>clone(payload),/stage policy source/);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trips').get()!.n,1);
 }finally{f.sqlite.close();}
});

test('opt-in workflows cannot bypass physical prerequisites through legacy progress, while owner cancellation works',async()=>{
 const f=await fixture();try{await f.policies.save(required,0);const input=await f.input('GATED',{stagePolicy:'workspace_v1',stagePolicyVersion:1}),trip=await f.owner.command('trip.create',input),before=await f.owner.owned('trips',trip.id,f.org),profit=(await f.owner.financeReport('2026-2027')).report.netProfit;
  await assert.rejects(f.owner.command('trip.event',{tripId:trip.id,version:1,kind:'dispatch',eventAt:new Date().toISOString(),requestId:'stage-gated-dispatch'}),/placement/);assert.deepEqual(await f.owner.owned('trips',trip.id,f.org),before);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trip_events').get()!.n,0);
  await f.owner.command('trip.event',{tripId:trip.id,version:1,kind:'cancel',note:'Synthetic unfinished workflow cancellation',eventAt:new Date().toISOString(),requestId:'stage-gated-cancel'});assert.equal((await f.owner.owned('trips',trip.id,f.org)).status,'cancelled');assert.equal((await f.owner.command('trip.create',input)).alreadyRecorded,true);assert.equal((await f.owner.financeReport('2026-2027')).report.netProfit,profit);for(const table of ['invoice_receipts','supplier_payments'])assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM '+table).get()!.n,0);
 }finally{f.sqlite.close();}
});
