import {test} from 'vitest';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {database} from './helpers/database';
import {TransportService} from '../lib/service';
import {WorkspaceStagePolicies} from '../lib/workspace-stage-policy';

const required={version:1,placement:'accepted_file',loading:'accepted_file',arrival:'accepted_file'};
const optional={version:1,placement:'optional',loading:'optional',arrival:'optional'};
async function fixture(){const {db,sqlite}=database(),owner=new TransportService(db,{userId:'stage-policy-owner',email:'owner@stages.test'});await owner.command('workspace.create',{name:'Synthetic stage policy business'});return {db,sqlite,owner,policies:new WorkspaceStagePolicies(owner)};}

test('no saved stage policy means no opt-in and reads create neither revision nor audit',async()=>{
 const f=await fixture();try{assert.equal(await f.policies.current(),null);assert.deepEqual(await f.policies.history(),[]);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM workspace_stage_policies').get()!.n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit').get()!.n,0);}finally{f.sqlite.close();}
});

test('owner revisions append atomically with immutable policy snapshots and bounded history',async()=>{
 const f=await fixture();try{
  const a=await f.policies.save(required,0),b=await f.policies.save(optional,1);assert.equal(a.version,1);assert.equal(b.version,2);assert.notEqual(a.id,b.id);assert.ok(Object.isFrozen(a));assert.ok(Object.isFrozen(a.policy));assert.deepEqual(await f.policies.current(),b);
  const audit=f.sqlite.prepare("SELECT * FROM audit WHERE action='trip.stage-policy.save' ORDER BY created_at,id").all();assert.equal(audit.length,2);assert.equal(audit[0].actor,'stage-policy-owner');assert.ok(audit.every(row=>JSON.parse(String(row.target)).policy.version===1));
  await assert.rejects(f.policies.save(required,1),/changed/);assert.equal((await f.policies.history()).length,2);
  assert.throws(()=>f.sqlite.prepare('UPDATE workspace_stage_policies SET loading_rule=? WHERE id=?').run('optional',a.id),/immutable/);assert.throws(()=>f.sqlite.prepare('DELETE FROM workspace_stage_policies WHERE id=?').run(a.id),/immutable/);
  for(let n=2;n<102;n++)await f.policies.save(n%2?required:optional,n);
  const history=await f.policies.history();assert.equal(history.length,100);assert.equal(history[0].version,102);assert.equal(history.at(-1)!.version,3);assert.deepEqual(a.policy,required);
 }finally{f.sqlite.close();}
});

test('members read only their tenant current policy while owner history and edits stay restricted',async()=>{
 const f=await fixture();try{
  const org=(await f.owner.member()).org_id;await f.policies.save(required,0);
  for(const role of ['MEMBER','DISPATCHER']){const userId='stages-'+role;f.sqlite.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').run(userId,org,role+'@stages.test',role,'2026-10-27');const p=new WorkspaceStagePolicies(new TransportService(f.db,{userId,email:role+'@stages.test'}));assert.deepEqual((await p.current())!.policy,required);await assert.rejects(p.history(),/owner/);await assert.rejects(p.save(optional,1),/owner/);}
  const other=new TransportService(f.db,{userId:'stage-policy-other',email:'other@stages.test'});await other.command('workspace.create',{name:'Other synthetic stage business'});const otherPolicy=new WorkspaceStagePolicies(other);assert.equal(await otherPolicy.current(),null);await otherPolicy.save(optional,0);assert.deepEqual((await f.policies.current())!.policy,required);assert.deepEqual((await otherPolicy.current())!.policy,optional);
  const stranger=new WorkspaceStagePolicies(new TransportService(f.db,{userId:'stage-policy-stranger',email:'stranger@stages.test'}));await assert.rejects(stranger.current(),/workspace|invitation/);
 }finally{f.sqlite.close();}
});

test('strict input/version validation cannot create a revision or an audit entry',async()=>{
 const f=await fixture();try{
  for(const version of [undefined,null,'0',-1,0.5,Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER+1])await assert.rejects(f.policies.save(required,version),/Reload/);
  for(const policy of [undefined,null,{}, {...required,version:'1'},{...required,arrival:true},{...required,extra:'optional'}])await assert.rejects(f.policies.save(policy,0),/supported/);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM workspace_stage_policies').get()!.n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit').get()!.n,0);
 }finally{f.sqlite.close();}
});

test('failed audit rolls back the effective stage default and revision history',async()=>{
 const f=await fixture();try{const saved=await f.policies.save(required,0);f.sqlite.exec("CREATE TRIGGER synthetic_stage_policy_audit_failure BEFORE INSERT ON audit WHEN NEW.action='trip.stage-policy.save' BEGIN SELECT RAISE(ABORT,'Synthetic stage audit failure'); END;");await assert.rejects(f.policies.save(optional,1),/Synthetic stage audit failure/);assert.deepEqual(await f.policies.current(),saved);assert.equal((await f.policies.history()).length,1);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit WHERE action='trip.stage-policy.save'").get()!.n,1);}finally{f.sqlite.close();}
});

test('a serialized competing revision wins without leaving a losing row or audit',async()=>{
 const f=await fixture(),original=f.db.batch;let injected=false;
 try{f.db.batch=(async statements=>{if(!injected&&statements.some(s=>(s as unknown as {sql:string}).sql.includes('INSERT INTO workspace_stage_policies'))){injected=true;await f.policies.save(optional,0);}return original(statements);}) as typeof f.db.batch;await assert.rejects(f.policies.save(required,0),/changed/);assert.equal(injected,true);assert.deepEqual((await f.policies.current())!.policy,optional);assert.equal((await f.policies.history()).length,1);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit WHERE action='trip.stage-policy.save'").get()!.n,1);}finally{f.db.batch=original;f.sqlite.close();}
});

test('SQL guards reject unsupported contracts, rules, revision gaps and foreign organizations',async()=>{
 const f=await fixture();try{const org=(await f.owner.member()).org_id,insert=f.sqlite.prepare('INSERT INTO workspace_stage_policies VALUES(?,?,?,?,?,?,?,?,?)');
  for(const [version,contract,rule] of [[0,1,'optional'],[2,1,'optional'],[1.5,1,'optional'],[1,2,'optional'],[1,1,'unverified'],[1,1.5,'optional']])assert.throws(()=>insert.run(crypto.randomUUID(),org,version,contract,rule,'optional','optional','stage-policy-owner','2026-10-27'),/constraint|sequential/i);
  assert.throws(()=>insert.run('foreign-stage-policy','missing-org',1,1,'optional','optional','optional','stage-policy-owner','2026-10-27'),/FOREIGN KEY|workspace owner/);
  f.sqlite.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').run('stage-sql-member',org,'sql-member@stages.test','MEMBER','2026-10-27');
  assert.throws(()=>insert.run('member-stage-policy',org,1,1,'optional','optional','optional','stage-sql-member','2026-10-27'),/workspace owner/);
  await f.policies.save(required,0);assert.throws(()=>insert.run('duplicate-stage-revision',org,1,1,'optional','optional','optional','stage-policy-owner','2026-10-27'),/sequential|UNIQUE/);
 }finally{f.sqlite.close();}
});

test('schema-only upgrade and saved stage defaults preserve trips, issued invoices, payments and profit',async()=>{
 const {db,sqlite}=database('0028');try{
  const owner=new TransportService(db,{userId:'stage-upgrade-owner',email:'upgrade@stages.test'});await owner.command('workspace.create',{name:'Synthetic pre-stage-policy business'});const year='2026-2027',org=(await owner.member()).org_id;
  await owner.command('consignment.save',{year,cn:'STAGE-UPGRADE',date:'2026-10-26',company:'Synthetic customer',truck:'BR01AB1234',origin:'Patna',destination:'Delhi',freight:1000,advance:0});const c=(await owner.state(year)).consignments[0],supplier=await owner.command('account.save',{kind:'supplier',code:'STAGE-UPGRADE',name:'Synthetic carrier'});
  await owner.command('payments.save',{id:c.id,provider:'Synthetic carrier',truckFreight:500});
  await owner.command('supplier.payment.create',{consignmentId:c.id,date:'2026-10-27',kind:'payment',amount:100,method:'bank',reference:'Synthetic supplier payment',requestId:'stage-upgrade-supplier-payment'});
  // A real pre-0028 record, without invoking newly integrated code against an old schema.
  const trip={id:'historical-before-stage-policy'},vehicle=await owner.first('SELECT id FROM trip_vehicles WHERE org_id=? AND registration=?',org,c.truck);
  const payload=JSON.stringify({year,number:c.cn,registration:c.truck,supplierId:supplier.id,ids:[c.id],identity:'consignment_v1',podPolicyRequest:{contract:'legacy_v1',selection:'reference_v1'},podPolicySnapshot:{id:null,version:0,mode:'reference_v1'}});
  await db.batch([owner.statement("INSERT INTO trips(id,org_id,year,number,vehicle_id,vehicle_snapshot,supplier_party_id,supplier_snapshot,status,version,creation_payload,created_at,created_by,pod_policy) VALUES(?,?,?,?,?,?,?,?,'planned',1,?,?,?,'reference_v1')",trip.id,org,year,c.cn,vehicle!.id,c.truck,supplier.id,'Synthetic carrier',payload,'2026-10-26',owner.user.userId),owner.insert('trip_allocations',{id:'historical-stage-allocation',org_id:org,trip_id:trip.id,consignment_id:c.id,snapshot:JSON.stringify(c),active:1})]);
  const invoice=await owner.command('invoice.create',{year,date:'2026-10-27',ids:[c.id],taxMode:'none'});
  await owner.command('receipt.create',{invoiceId:invoice.id,date:'2026-10-27',amount:100,method:'bank',reference:'Synthetic customer receipt',requestId:'stage-upgrade-customer-receipt'});
  const tables=['organizations','memberships','consignments','trips','trip_allocations','trip_events','invoices','invoice_items','invoice_receipts','supplier_payments','finance_entries','assets','asset_scopes','workspace_pod_policies','audit'],before=Object.fromEntries(tables.map(t=>[t,sqlite.prepare('SELECT * FROM '+t).all()])),profit=(await owner.financeReport(year)).report.netProfit;
  sqlite.exec(readFileSync('drizzle/0028_workspace_stage_policies.sql','utf8'));sqlite.exec(readFileSync('drizzle/0029_trip_stage_snapshot_guards.sql','utf8'));for(const table of tables)assert.deepEqual(sqlite.prepare('SELECT * FROM '+table).all(),before[table],table+' after migration');
  assert.equal(await new WorkspaceStagePolicies(owner).current(),null);await new WorkspaceStagePolicies(owner).save(required,0);
  for(const table of tables.filter(t=>t!=='audit'))assert.deepEqual(sqlite.prepare('SELECT * FROM '+table).all(),before[table],table+' after save');assert.equal((await owner.financeReport(year)).report.netProfit,profit);
  assert.equal(JSON.parse((await owner.owned('trips',trip.id,org)).creation_payload).stagePolicySnapshot,undefined);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM invoice_receipts').get()!.n,1);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM supplier_payments').get()!.n,1);assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{sqlite.close();}
});
