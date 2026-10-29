import {test} from 'vitest';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {database} from './helpers/database';
import {TransportService} from '../lib/service';
import {WorkspaceStagePolicies} from '../lib/workspace-stage-policy';
import {TripStageDocuments} from '../lib/trip-stage-documents';
import {downloadableAsset,unscopedAsset} from '../lib/asset-access';

const file={name:'Synthetic-stage.pdf',type:'application/pdf',bytes:new TextEncoder().encode('%PDF-1.4 synthetic stage evidence')};
async function fixture(before=''){
 const {db,sqlite}=database(before),owner=new TransportService(db,{userId:'stage-file-owner',email:'owner@stage-file.test'});await owner.command('workspace.create',{name:'Synthetic stage file business'});const org=(await owner.member()).org_id;
 await owner.command('consignment.save',{year:'2026-2027',cn:'STAGE-FILE',date:'2026-10-26',company:'Synthetic customer',truck:'BR01AB1234',origin:'Patna',destination:'Delhi',freight:1000,advance:0});const booking=(await owner.state('2026-2027')).consignments[0],supplier=await owner.command('account.save',{kind:'supplier',code:'STAGE-FILE',name:'Synthetic carrier'});await new WorkspaceStagePolicies(owner).save({version:1,placement:'accepted_file',loading:'accepted_file',arrival:'accepted_file'},0);
 const trip=await owner.command('trip.create',{consignmentId:booking.id,supplierId:supplier.id,registration:booking.truck,stagePolicy:'workspace_v1',stagePolicyVersion:1,requestId:'stage-file-trip'}),allocation=await owner.first('SELECT id FROM trip_allocations WHERE trip_id=?',trip.id),objects=new Map<string,Uint8Array>();
 const bucket={put:async(key:string,bytes:Uint8Array)=>{objects.set(key,bytes.slice());},delete:async(key:string)=>{objects.delete(key);}} as unknown as R2Bucket;
 return {db,sqlite,owner,org,booking,trip,allocationId:allocation!.id,objects,bucket,files:new TripStageDocuments(owner),input:{tripId:trip.id,stage:'placement',allocationId:null,version:1,requestId:'stage-file-upload'}};
}

test('private stage upload is immutable, idempotent and does not manufacture progress or financial changes',async()=>{
 const f=await fixture();try{const issued=await f.owner.command('invoice.create',{year:'2026-2027',date:'2026-10-27',ids:[f.booking.id],taxMode:'none'});await f.owner.command('receipt.create',{invoiceId:issued.id,date:'2026-10-27',amount:100,method:'bank',reference:'Synthetic receipt',requestId:'stage-file-receipt'});
  const tables=['consignments','invoices','invoice_items','invoice_receipts','supplier_payments','trip_events'],before=Object.fromEntries(tables.map(t=>[t,f.sqlite.prepare('SELECT * FROM '+t).all()])),profit=(await f.owner.financeReport('2026-2027')).report.netProfit;
  const result=await f.files.upload(f.input,file,f.bucket),doc=f.sqlite.prepare('SELECT * FROM trip_stage_documents').get()!;assert.equal(f.objects.size,1);assert.equal(doc.stage,'placement');assert.equal(doc.allocation_id,null);assert.equal(doc.trip_version,2);assert.equal((await f.owner.owned('trips',f.trip.id,f.org)).status,'planned');assert.equal((await f.files.list(f.trip.id)).length,1);assert.equal((await f.files.file(String(doc.asset_id))).org,f.org);
  assert.equal((await f.files.upload(f.input,file,f.bucket)).alreadyRecorded,true);await assert.rejects(f.files.upload(f.input,{...file,name:'Changed.pdf'},f.bucket),/another stage document/);assert.equal(f.objects.size,1);assert.equal(result.id,doc.id);
  assert.throws(()=>f.sqlite.prepare('UPDATE trip_stage_documents SET stage=? WHERE id=?').run('loading',doc.id),/immutable/);assert.throws(()=>f.sqlite.prepare('DELETE FROM trip_stage_documents WHERE id=?').run(doc.id),/immutable/);assert.throws(()=>f.sqlite.prepare('UPDATE assets SET name=? WHERE id=?').run('Changed.pdf',doc.asset_id),/immutable/);
  for(const table of tables)assert.deepEqual(f.sqlite.prepare('SELECT * FROM '+table).all(),before[table],table);assert.equal((await f.owner.financeReport('2026-2027')).report.netProfit,profit);
  const backup=await f.owner.backup();assert.equal(backup.records.trip_stage_documents.length,1);assert.doesNotMatch(JSON.stringify(backup.records.trip_stage_documents),/%PDF-1.4/);
 }finally{f.objects.clear();f.sqlite.close();}
});

test('stage files stay owner-private, tenant-scoped and unavailable as public images or generic documents',async()=>{
 const f=await fixture();try{await f.files.upload(f.input,file,f.bucket);const assetId=String(f.sqlite.prepare('SELECT asset_id FROM trip_stage_documents').get()!.asset_id);
  for(const role of ['MEMBER','DISPATCHER']){const userId='stage-file-'+role;f.sqlite.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').run(userId,f.org,role+'@stage-file.test',role,'2026-10-27');const member=new TripStageDocuments(new TransportService(f.db,{userId,email:role+'@stage-file.test'}));await assert.rejects(member.list(f.trip.id),/owner/);await assert.rejects(member.file(assetId),/owner/);await assert.rejects(member.upload(f.input,file,f.bucket),/owner/);}
  const other=new TransportService(f.db,{userId:'stage-file-other',email:'other@stage-file.test'});await other.command('workspace.create',{name:'Other synthetic stage files'});const foreign=new TripStageDocuments(other);await assert.rejects(foreign.file(assetId),/not found/);await assert.rejects(foreign.list(f.trip.id),/not found/);await assert.rejects(foreign.upload({...f.input,requestId:'foreign-stage-upload'},file,f.bucket),/not found/);
  await assert.rejects(unscopedAsset(f.owner,assetId,f.org),/Private documents/);await assert.rejects(downloadableAsset(f.owner,assetId),/unavailable/);assert.equal(f.objects.size,1);
 }finally{f.objects.clear();f.sqlite.close();}
});

test('invalid scope, file, version and phase inputs never store bytes',async()=>{
 const f=await fixture();try{
  for(const extra of [{stage:'pod'},{stage:'placement',allocationId:f.allocationId},{stage:'loading',allocationId:null},{stage:'loading',allocationId:'foreign-allocation'},{stage:'arrival',allocationId:f.allocationId},{version:'1'},{version:0},{version:2},{requestId:'bad_request'}])await assert.rejects(f.files.upload({...f.input,...extra},file,f.bucket));
  for(const invalid of [{...file,bytes:new Uint8Array()},{...file,type:'text/plain'},{...file,bytes:new TextEncoder().encode('not a PDF')},{...file,bytes:new Uint8Array(2097153)}])await assert.rejects(f.files.upload(f.input,invalid,f.bucket));
  assert.equal(f.objects.size,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trip_stage_documents').get()!.n,0);assert.equal((await f.owner.owned('trips',f.trip.id,f.org)).version,1);
 }finally{f.objects.clear();f.sqlite.close();}
});

test('a same-version losing upload deletes only its own attempted object, preserving the winner',async()=>{
 const f=await fixture(),originalPut=f.bucket.put;let injected=false;const deleted:string[]=[];const originalDelete=f.bucket.delete;
 try{f.bucket.put=(async(...args:any[])=>{await (originalPut as any)(...args);if(!injected){injected=true;await f.files.upload({...f.input,requestId:'stage-winning-upload'},file,f.bucket);}return undefined;}) as unknown as typeof f.bucket.put;f.bucket.delete=(async(key:string)=>{deleted.push(key);await originalDelete(key);}) as typeof f.bucket.delete;
  await assert.rejects(f.files.upload(f.input,file,f.bucket),(e:any)=>e.status===409);assert.equal(f.objects.size,1);assert.equal(deleted.length,1);const winner=f.sqlite.prepare('SELECT * FROM trip_stage_documents').get()!;assert.match(String(winner.id),/stage-winning-upload$/);assert.ok(f.objects.has(f.org+'/'+winner.asset_id));assert.equal((await f.owner.owned('trips',f.trip.id,f.org)).version,2);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit WHERE action='trip.stage-file.upload'").get()!.n,1);
 }finally{f.bucket.put=originalPut;f.bucket.delete=originalDelete;f.objects.clear();f.sqlite.close();}
});

test('audit failure rolls back metadata/version and cleans up the attempted object',async()=>{
 const f=await fixture();try{f.sqlite.exec("CREATE TRIGGER synthetic_stage_file_audit_failure BEFORE INSERT ON audit WHEN NEW.action='trip.stage-file.upload' BEGIN SELECT RAISE(ABORT,'Synthetic stage file audit failure'); END;");await assert.rejects(f.files.upload(f.input,file,f.bucket),/Synthetic stage file audit failure/);assert.equal(f.objects.size,0);for(const table of ['assets','asset_scopes','trip_stage_documents'])assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM '+table).get()!.n,0);assert.equal((await f.owner.owned('trips',f.trip.id,f.org)).version,1);}finally{f.objects.clear();f.sqlite.close();}
});

test('partial storage failure cleans up, while a committed database response failure keeps referenced bytes',async()=>{
 const f=await fixture(),originalPut=f.bucket.put,originalBatch=f.db.batch;
 try{f.bucket.put=(async(...args:any[])=>{await (originalPut as any)(...args);throw Error('Synthetic put response failure');}) as typeof f.bucket.put;await assert.rejects(f.files.upload(f.input,file,f.bucket),/Synthetic put response failure/);assert.equal(f.objects.size,0);assert.equal((await f.owner.owned('trips',f.trip.id,f.org)).version,1);f.bucket.put=originalPut;
  let thrown=false;f.db.batch=(async statements=>{const result=await originalBatch(statements);if(!thrown&&statements.some(s=>(s as unknown as {sql:string}).sql.includes('INSERT INTO trip_stage_documents'))){thrown=true;throw Error('Synthetic committed response failure');}return result;}) as typeof f.db.batch;
  const result=await f.files.upload(f.input,file,f.bucket);assert.equal(result.alreadyRecorded,true);assert.equal(f.objects.size,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trip_stage_documents').get()!.n,1);
 }finally{f.bucket.put=originalPut;f.db.batch=originalBatch;f.objects.clear();f.sqlite.close();}
});

test('scope quota preserves history and other stage slots remain independent',async()=>{
 const f=await fixture();try{for(let n=0;n<20;n++)await f.files.upload({...f.input,version:n+1,requestId:'stage-quota-upload-'+n},file,f.bucket);await assert.rejects(f.files.upload({...f.input,version:21,requestId:'stage-quota-upload-extra'},file,f.bucket),/20-file limit/);assert.equal(f.objects.size,20);
  await f.files.upload({...f.input,stage:'loading',allocationId:f.allocationId,version:21,requestId:'stage-loading-upload'},file,f.bucket);assert.equal(f.objects.size,21);
  const doc=f.sqlite.prepare('SELECT * FROM trip_stage_documents LIMIT 1').get()!,insert=f.sqlite.prepare('INSERT INTO trip_stage_documents VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');assert.throws(()=>insert.run('forged-stage-file',f.org,f.trip.id,'foreign-allocation',doc.asset_id,'loading',22,doc.sha256,doc.size,doc.payload,'stage-file-owner',doc.created_at),/private asset scope/);
 }finally{f.objects.clear();f.sqlite.close();}
});

test('unavailable outcome checks preserve committed bytes and cleanup failures remain explicit',async()=>{
 const f=await fixture(),originalBatch=f.db.batch,originalPrepare=f.db.prepare,originalDelete=f.bucket.delete;let blockRead=false;
 try{f.db.batch=(async statements=>{await originalBatch(statements);blockRead=true;throw Error('Synthetic uncertain response');}) as typeof f.db.batch;
  f.db.prepare=((sql:string)=>{if(blockRead&&sql.includes('SELECT * FROM trip_stage_documents'))throw Error('Synthetic unavailable outcome read');return originalPrepare(sql);}) as typeof f.db.prepare;
  await assert.rejects(f.files.upload(f.input,file,f.bucket),(e:any)=>e.status===503&&/outcome is unavailable/.test(e.message));assert.equal(f.objects.size,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trip_stage_documents').get()!.n,1);
  f.db.batch=originalBatch;f.db.prepare=originalPrepare;assert.equal((await f.files.upload(f.input,file,f.bucket)).alreadyRecorded,true);assert.equal(f.objects.size,1);
  f.sqlite.exec("CREATE TRIGGER synthetic_stage_file_cleanup_failure BEFORE INSERT ON audit WHEN NEW.action='trip.stage-file.upload' BEGIN SELECT RAISE(ABORT,'Synthetic rollback before cleanup'); END;");f.bucket.delete=(async()=>{throw Error('Synthetic storage cleanup unavailable');}) as typeof f.bucket.delete;
  await assert.rejects(f.files.upload({...f.input,version:2,requestId:'stage-cleanup-failure'},file,f.bucket),(e:any)=>e.status===503&&/cleanup needs retry/.test(e.message));assert.equal(f.objects.size,2);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trip_stage_documents').get()!.n,1);
 }finally{f.db.batch=originalBatch;f.db.prepare=originalPrepare;f.bucket.delete=originalDelete;f.objects.clear();f.sqlite.close();}
});

test('arrival requires dispatched phase, and terminal retries confirm only previously stored files',async()=>{
 const f=await fixture();try{await assert.rejects(f.files.upload({...f.input,stage:'arrival',allocationId:f.allocationId},file,f.bucket),/not open/);
  // Synthetic phase fixture for storage unit coverage, not a milestone-flow test.
  f.sqlite.prepare("UPDATE trips SET status='dispatched',version=2 WHERE id=?").run(f.trip.id);const arrival={...f.input,stage:'arrival',allocationId:f.allocationId,version:2};await f.files.upload(arrival,file,f.bucket);
  f.sqlite.prepare("UPDATE trips SET status='closed',version=4 WHERE id=?").run(f.trip.id);assert.equal((await f.files.upload(arrival,file,f.bucket)).alreadyRecorded,true);await assert.rejects(f.files.upload({...arrival,version:4,requestId:'stage-terminal-new-upload'},file,f.bucket),/not open/);assert.equal(f.objects.size,1);
 }finally{f.objects.clear();f.sqlite.close();}
});

test('schema-only file migration preserves existing trips, issued invoice and customer receipt',async()=>{
 const f=await fixture('0030');try{const invoice=await f.owner.command('invoice.create',{year:'2026-2027',date:'2026-10-27',ids:[f.booking.id],taxMode:'none'});await f.owner.command('receipt.create',{invoiceId:invoice.id,date:'2026-10-27',amount:100,method:'bank',reference:'Synthetic pre-file receipt',requestId:'stage-file-upgrade-receipt'});
  const tables=['trips','trip_allocations','trip_events','consignments','invoices','invoice_items','invoice_receipts','supplier_payments','assets','asset_scopes','audit'],before=Object.fromEntries(tables.map(t=>[t,f.sqlite.prepare('SELECT * FROM '+t).all()]));f.sqlite.exec(readFileSync('drizzle/0030_trip_stage_documents.sql','utf8'));for(const table of tables)assert.deepEqual(f.sqlite.prepare('SELECT * FROM '+table).all(),before[table],table);assert.equal(f.sqlite.prepare('PRAGMA foreign_key_check').all().length,0);assert.equal((await f.files.list(f.trip.id)).length,0);
 }finally{f.objects.clear();f.sqlite.close();}
});
