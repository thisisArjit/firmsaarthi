import {test} from 'vitest';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {database} from './helpers/database';
import {TransportService} from '../lib/service';
import {WorkspaceStagePolicies} from '../lib/workspace-stage-policy';
import {TripStageDocuments} from '../lib/trip-stage-documents';
import {TripStageReviews} from '../lib/trip-stage-reviews';
import {stageEvidenceChecklist} from '../lib/trip-stage-evidence';

const policy={version:1,placement:'accepted_file',loading:'accepted_file',arrival:'accepted_file'} as const;
// Earlier review-storage fixtures intentionally precede complete physical event insertion guards.
async function fixture(before='0033'){
 const {db,sqlite}=database(before),owner=new TransportService(db,{userId:'stage-review-owner',email:'owner@stage-review.test'});await owner.command('workspace.create',{name:'Synthetic review company'});const org=(await owner.member()).org_id;
 await owner.command('consignment.save',{year:'2026-2027',cn:'REVIEW',date:'2026-10-26',company:'Synthetic customer',truck:'BR01AB1234',origin:'Patna',destination:'Delhi',freight:1000,advance:0});const booking=(await owner.state('2026-2027')).consignments[0],supplier=await owner.command('account.save',{kind:'supplier',code:'REVIEW',name:'Synthetic carrier'});
 await new WorkspaceStagePolicies(owner).save(policy,0);const trip=await owner.command('trip.create',{consignmentId:booking.id,supplierId:supplier.id,registration:booking.truck,stagePolicy:'workspace_v1',stagePolicyVersion:1,requestId:'stage-review-trip'}),allocationId=(await owner.first('SELECT id FROM trip_allocations WHERE trip_id=?',trip.id))!.id;
 const objects=new Map<string,Uint8Array>(),bucket={put:async(key:string,bytes:Uint8Array)=>{objects.set(key,bytes.slice());},delete:async(key:string)=>{objects.delete(key);}} as unknown as R2Bucket,files=new TripStageDocuments(owner);
 const uploaded=await files.upload({tripId:trip.id,stage:'placement',version:1,requestId:'stage-review-file'},{name:'Synthetic.pdf',type:'application/pdf',bytes:new TextEncoder().encode('%PDF-1.4 synthetic review')},bucket),doc=await owner.first('SELECT * FROM trip_stage_documents WHERE id=?',uploaded.id),reviews=new TripStageReviews(owner);
 const input={tripId:trip.id,documentId:uploaded.id,kind:'accept',version:2,eventAt:new Date().toISOString(),note:'',requestId:'stage-review-decision'};
 return {db,sqlite,owner,org,booking,trip,allocationId,objects,bucket,files,doc:doc!,reviews,input};
}
async function next(f:Awaited<ReturnType<typeof fixture>>,extra:Record<string,unknown>){return {...f.input,version:(await f.owner.owned('trips',f.trip.id,f.org)).version,eventAt:new Date().toISOString(),...extra};}

test('exact-file owner acceptance projects into the checklist without progress or financial effects',async()=>{
 const f=await fixture();try{
  const invoice=await f.owner.command('invoice.create',{year:'2026-2027',date:'2026-10-27',ids:[f.booking.id],taxMode:'none'});await f.owner.command('receipt.create',{invoiceId:invoice.id,date:'2026-10-27',amount:100,method:'bank',reference:'Synthetic',requestId:'stage-review-receipt'});
  const tables=['consignments','invoices','invoice_items','invoice_receipts','supplier_payments','trip_events','trip_stage_documents'],before=Object.fromEntries(tables.map(t=>[t,f.sqlite.prepare('SELECT * FROM '+t).all()])),profit=(await f.owner.financeReport('2026-2027')).report.netProfit;
  const context={orgId:f.org,tripId:f.trip.id,activeAllocationIds:[f.allocationId],documents:await f.reviews.documents(f.trip.id)};assert.equal(stageEvidenceChecklist(policy,'placement',context).missing.length,1);
  const result=await f.reviews.record(f.input),rows=await f.reviews.history(f.trip.id);assert.equal(rows.length,1);assert.equal(rows[0].id,result.id);assert.equal(rows[0].actor_role,'OWNER');assert.equal(rows[0].document_id,f.doc.id);assert.equal(rows[0].trip_version,3);assert.ok(rows[0].recorded_at>=rows[0].event_at);
  context.documents=await f.reviews.documents(f.trip.id);assert.deepEqual(stageEvidenceChecklist(policy,'placement',context).missing,[]);assert.equal(stageEvidenceChecklist(policy,'loading',context).missing.length,1);
  for(const table of tables)assert.deepEqual(f.sqlite.prepare('SELECT * FROM '+table).all(),before[table],table);assert.equal((await f.owner.financeReport('2026-2027')).report.netProfit,profit);assert.equal((await f.owner.owned('trips',f.trip.id,f.org)).status,'planned');
  const backup=await f.owner.backup();assert.equal(backup.records.trip_stage_reviews.length,1);assert.doesNotMatch(JSON.stringify(backup.records.trip_stage_reviews),/%PDF/);assert.throws(()=>f.sqlite.exec("UPDATE trip_stage_reviews SET note='rewrite'"),/immutable/);assert.throws(()=>f.sqlite.exec('DELETE FROM trip_stage_reviews'),/immutable/);
 }finally{f.objects.clear();f.sqlite.close();}
});

test('reviews and projections deny members, dispatchers, foreign tenants and non-stage document identities',async()=>{
 const f=await fixture();try{
  for(const role of ['MEMBER','DISPATCHER']){const userId='stage-review-'+role;f.sqlite.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').run(userId,f.org,role+'@review.test',role,'2026-10-27');const r=new TripStageReviews(new TransportService(f.db,{userId,email:role+'@review.test'}));await assert.rejects(r.record(f.input),/owner/);await assert.rejects(r.history(f.trip.id),/owner/);await assert.rejects(r.documents(f.trip.id),/owner/);}
  const other=new TransportService(f.db,{userId:'foreign-review',email:'foreign@review.test'});await other.command('workspace.create',{name:'Other synthetic company'});const foreign=new TripStageReviews(other);await assert.rejects(foreign.record(f.input),/not found/);await assert.rejects(foreign.history(f.trip.id),/not found/);await assert.rejects(foreign.documents(f.trip.id),/not found/);
  await assert.rejects(f.reviews.record({...f.input,documentId:f.doc.asset_id}),/not found/);await assert.rejects(f.reviews.record({...f.input,documentId:'operational-file'}),/not found/);assert.equal((await f.reviews.history(f.trip.id)).length,0);
 }finally{f.objects.clear();f.sqlite.close();}
});

test('stable reviews replay before changed phase/version and altered retries cannot rewrite decisions',async()=>{
 const f=await fixture();try{await f.reviews.record(f.input);assert.equal((await f.reviews.record(f.input)).alreadyRecorded,true);await assert.rejects(f.reviews.record({...f.input,note:'Changed'}),/another review/);
  f.sqlite.prepare("UPDATE trips SET status='cancelled',version=version+1 WHERE id=?").run(f.trip.id);assert.equal((await f.reviews.record(f.input)).alreadyRecorded,true);await assert.rejects(f.reviews.record({...f.input,requestId:'stage-new-decision',version:4}),/not open/);assert.equal((await f.reviews.history(f.trip.id)).length,1);
 }finally{f.objects.clear();f.sqlite.close();}
});

test('rejection and acceptance require explicit reasoned corrections and preserve all review history',async()=>{
 const f=await fixture();try{
  const rejected=await f.reviews.record({...f.input,kind:'reject',note:'Image is unreadable'});assert.equal((await f.reviews.documents(f.trip.id))[0].review?.decision,'reject');await assert.rejects(f.reviews.record(await next(f,{requestId:'stage-second-decision'})),/Correct the active/);
  await assert.rejects(f.reviews.record(await next(f,{kind:'correction',targetId:rejected.id,note:'',requestId:'stage-correct-rejection'})),/reason/);
  const corrected=await f.reviews.record(await next(f,{kind:'correction',targetId:rejected.id,note:'Wrong file decision',requestId:'stage-correct-rejection'}));assert.equal((await f.reviews.documents(f.trip.id))[0].review,null);
  await assert.rejects(f.reviews.record(await next(f,{kind:'correction',targetId:corrected.id,note:'Cannot correct a correction',requestId:'stage-invalid-target'})),/active review/);
  const accepted=await f.reviews.record(await next(f,{requestId:'stage-accept-again'}));await f.reviews.record(await next(f,{kind:'correction',targetId:accepted.id,note:'Acceptance withdrawn',requestId:'stage-correct-acceptance'}));assert.equal((await f.reviews.documents(f.trip.id))[0].review,null);assert.equal((await f.reviews.history(f.trip.id)).length,4);
 }finally{f.objects.clear();f.sqlite.close();}
});

test('validation rejects malformed, future, pre-upload and stale review claims without writes',async()=>{
 const f=await fixture();try{
  for(const extra of [{version:'2'},{version:0},{version:3},{requestId:'bad_id'},{kind:'verify'},{kind:'reject',note:''},{note:'x'.repeat(501)},{note:null},{eventAt:'2026-01-01T00:00:00.000Z'},{eventAt:'2099-01-01T00:00:00.000Z'},{eventAt:'2026-10-27'},{eventAt:'bad'},{targetId:'unexpected'},{kind:'correction',targetId:null,note:'Reason'}])await assert.rejects(f.reviews.record({...f.input,...extra}));
  assert.equal((await f.owner.owned('trips',f.trip.id,f.org)).version,2);assert.equal((await f.reviews.history(f.trip.id)).length,0);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit WHERE action='trip.stage-file.review'").get()!.n,0);
 }finally{f.objects.clear();f.sqlite.close();}
});

test('accepted-file correction fails closed with active dependent progress and succeeds after explicit reversal',async()=>{
 const f=await fixture();try{const accepted=await f.reviews.record(f.input),at=new Date().toISOString();
  // Earlier-schema SQL fixture; latest-schema milestone tests live in trip-stage-service.
  f.sqlite.prepare('UPDATE trips SET version=4 WHERE id=?').run(f.trip.id);f.sqlite.prepare('INSERT INTO trip_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run('synthetic-placement',f.org,f.trip.id,4,'placement',null,null,at,'','Synthetic dependency','{}','stage-review-owner',at);
  const correction=await next(f,{kind:'correction',targetId:accepted.id,note:'Wrong evidence',requestId:'stage-dependency-correction'});await assert.rejects(f.reviews.record(correction),/dependent trip progress/);assert.equal((await f.reviews.history(f.trip.id)).length,1);
  f.sqlite.prepare('UPDATE trips SET version=5 WHERE id=?').run(f.trip.id);f.sqlite.prepare('INSERT INTO trip_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run('synthetic-reversal',f.org,f.trip.id,5,'correction',null,'synthetic-placement',at,'','Synthetic reversal','{}','stage-review-owner',at);await f.reviews.record(await next(f,{...correction,version:5}));assert.equal((await f.reviews.documents(f.trip.id))[0].review,null);
 }finally{f.objects.clear();f.sqlite.close();}
});

test('a racing trip-version winner leaves no losing review or audit; audit failure rolls back the claim',async()=>{
 const f=await fixture(),batch=f.db.batch;let inject=true;try{
  f.db.batch=(async statements=>{if(inject){inject=false;f.db.batch=batch;await f.reviews.record({...f.input,kind:'reject',note:'Synthetic winner',requestId:'stage-review-winner'});}return batch(statements);}) as typeof f.db.batch;
  await assert.rejects(f.reviews.record(f.input),(e:any)=>e.status===409);assert.equal((await f.reviews.history(f.trip.id)).length,1);assert.equal((await f.owner.owned('trips',f.trip.id,f.org)).version,3);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit WHERE action='trip.stage-file.review'").get()!.n,1);
  f.sqlite.exec("CREATE TRIGGER synthetic_review_audit_failure BEFORE INSERT ON audit WHEN NEW.action='trip.stage-file.review' BEGIN SELECT RAISE(ABORT,'Synthetic review audit failure'); END;");const active=(await f.reviews.history(f.trip.id))[0];await assert.rejects(f.reviews.record(await next(f,{kind:'correction',targetId:active.id,note:'Reason',requestId:'stage-review-failed-audit'})),/Synthetic review audit failure/);assert.equal((await f.owner.owned('trips',f.trip.id,f.org)).version,3);assert.equal((await f.reviews.history(f.trip.id)).length,1);
 }finally{f.db.batch=batch;f.objects.clear();f.sqlite.close();}
});

test('uncertain database responses recover committed reviews without duplicate history',async()=>{
 const f=await fixture(),batch=f.db.batch,prepare=f.db.prepare;let unavailable=false;try{
  f.db.batch=(async statements=>{await batch(statements);throw Error('Synthetic lost commit response');}) as typeof f.db.batch;assert.equal((await f.reviews.record(f.input)).alreadyRecorded,true);assert.equal((await f.reviews.history(f.trip.id)).length,1);
  const correction=await next(f,{kind:'correction',targetId:(await f.reviews.history(f.trip.id))[0].id,note:'Synthetic reason',requestId:'stage-review-unknown'});
  f.db.batch=(async statements=>{await batch(statements);unavailable=true;throw Error('Synthetic unknown outcome');}) as typeof f.db.batch;f.db.prepare=((sql:string)=>{if(unavailable&&sql.includes('SELECT * FROM trip_stage_reviews'))throw Error('Synthetic unavailable read');return prepare(sql);}) as typeof f.db.prepare;
  await assert.rejects(f.reviews.record(correction),(e:any)=>e.status===503);unavailable=false;f.db.batch=batch;assert.equal((await f.reviews.record(correction)).alreadyRecorded,true);assert.equal((await f.reviews.history(f.trip.id)).length,2);
 }finally{f.db.batch=batch;f.db.prepare=prepare;f.objects.clear();f.sqlite.close();}
});

test('database guards reject forged identity, role, active decisions, correction target and dependency bypass',async()=>{
 const f=await fixture();try{
  const insert=(id:string,extra:Record<string,any>={})=>{const r={org:f.org,trip:f.trip.id,doc:f.doc.id,kind:'accept',target:null,version:3,at:new Date().toISOString(),note:'',actor:'stage-review-owner',role:'OWNER',...extra},payload=JSON.stringify({tripId:r.trip,documentId:r.doc,kind:r.kind,targetId:r.target,eventAt:r.at,note:r.note});return f.sqlite.prepare('INSERT INTO trip_stage_reviews VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,r.org,r.trip,r.doc,r.kind,r.target,r.version,r.at,r.note,payload,r.actor,r.role,r.at);};
  f.sqlite.prepare('UPDATE trips SET version=3 WHERE id=?').run(f.trip.id);
  for(const extra of [{doc:f.doc.asset_id},{org:'other-org'},{trip:'foreign-trip'},{actor:'foreign-actor'},{role:'MEMBER'},{version:2},{kind:'reject'},{kind:'correction',target:'missing',note:'Reason'}])assert.throws(()=>insert('forged',extra));
  insert('valid-synthetic-review');const collisionAt=new Date().toISOString();assert.throws(()=>f.sqlite.prepare('INSERT INTO trip_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run('colliding-stage-event',f.org,f.trip.id,3,'placement',null,null,collisionAt,'','','{}','stage-review-owner',collisionAt),/stage evidence/);f.sqlite.prepare('UPDATE trips SET version=4 WHERE id=?').run(f.trip.id);assert.throws(()=>insert('duplicate-active',{version:4}),/active review/);
  const at=new Date().toISOString();f.sqlite.prepare('INSERT INTO trip_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run('synthetic-loaded',f.org,f.trip.id,4,'loading',f.allocationId,null,at,'','','{}','stage-review-owner',at);assert.throws(()=>insert('dependency-bypass',{version:4,kind:'correction',target:'valid-synthetic-review',note:'Reason'}),/dependent trip progress/);assert.equal((await f.reviews.history(f.trip.id)).length,1);
 }finally{f.objects.clear();f.sqlite.close();}
});

test('allocation reviews stay separate, inactive allocations reject and captured owner role survives a later role change',async()=>{
 const f=await fixture();try{
  const file={name:'Synthetic allocation.pdf',type:'application/pdf',bytes:new TextEncoder().encode('%PDF-1.4 synthetic allocation')};
  const loading=await f.files.upload({tripId:f.trip.id,stage:'loading',allocationId:f.allocationId,version:2,requestId:'stage-loading-review-file'},file,f.bucket);
  await f.reviews.record(await next(f,{documentId:loading.id,requestId:'stage-loading-accept'}));
  const context={orgId:f.org,tripId:f.trip.id,activeAllocationIds:[f.allocationId],documents:await f.reviews.documents(f.trip.id)};assert.equal(stageEvidenceChecklist(policy,'placement',context).missing.length,1);assert.equal(stageEvidenceChecklist(policy,'loading',context).missing.length,0);assert.equal(stageEvidenceChecklist(policy,'arrival',context).missing.length,1);
  f.sqlite.prepare('UPDATE trip_allocations SET active=0 WHERE id=?').run(f.allocationId);await assert.rejects(f.reviews.record(await next(f,{documentId:loading.id,kind:'correction',targetId:(await f.reviews.history(f.trip.id))[0].id,note:'Inactive',requestId:'stage-inactive-correction'})),/no longer active/);f.sqlite.prepare('UPDATE trip_allocations SET active=1 WHERE id=?').run(f.allocationId);
  // Synthetic dispatched phase fixture: no production milestone transition is exercised.
  const dispatchedAt=new Date().toISOString();f.sqlite.prepare("UPDATE trips SET status='dispatched',version=5 WHERE id=?").run(f.trip.id);f.sqlite.prepare('INSERT INTO trip_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run('synthetic-dispatch',f.org,f.trip.id,5,'dispatch',null,null,dispatchedAt,'','','{}','stage-review-owner',dispatchedAt);const arrival=await f.files.upload({tripId:f.trip.id,stage:'arrival',allocationId:f.allocationId,version:5,requestId:'stage-arrival-review-file'},file,f.bucket);const arrivalReview=await f.reviews.record(await next(f,{documentId:arrival.id,requestId:'stage-arrival-accept'}));await assert.rejects(f.reviews.record(await next(f,{requestId:'stage-too-late-placement'})),/not open/);
  // Earlier dispatch is a prerequisite, not a dependent of arrival evidence.
  await f.reviews.record(await next(f,{documentId:arrival.id,kind:'correction',targetId:arrivalReview.id,note:'Wrong arrival photo',requestId:'stage-correct-arrival'}));assert.equal((await f.reviews.documents(f.trip.id)).find(d=>d.id===arrival.id)!.review,null);
  f.sqlite.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').run('new-stage-owner',f.org,'new-owner@review.test','OWNER','2026-10-27');f.sqlite.prepare("UPDATE memberships SET role='MEMBER' WHERE user_id='stage-review-owner'").run();const nextOwner=new TripStageReviews(new TransportService(f.db,{userId:'new-stage-owner',email:'new-owner@review.test'}));assert.equal((await nextOwner.documents(f.trip.id)).find(d=>d.id===loading.id)!.review!.actorRoleAtReview,'OWNER');assert.equal((await nextOwner.history(f.trip.id)).length,3);
 }finally{f.objects.clear();f.sqlite.close();}
});

test('placement progress does not block correction of later loading evidence',async()=>{
 const f=await fixture();try{const at=new Date().toISOString();f.sqlite.prepare('UPDATE trips SET version=3 WHERE id=?').run(f.trip.id);f.sqlite.prepare('INSERT INTO trip_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run('synthetic-earlier-placement',f.org,f.trip.id,3,'placement',null,null,at,'','','{}','stage-review-owner',at);
  const file=await f.files.upload({tripId:f.trip.id,stage:'loading',allocationId:f.allocationId,version:3,requestId:'stage-loading-after-placement'},{name:'Loading.pdf',type:'application/pdf',bytes:new TextEncoder().encode('%PDF-1.4 synthetic loading')},f.bucket);const review=await f.reviews.record(await next(f,{documentId:file.id,requestId:'stage-loading-later-review'}));await f.reviews.record(await next(f,{documentId:file.id,kind:'correction',targetId:review.id,note:'Wrong loading photo',requestId:'stage-loading-later-correction'}));assert.equal((await f.reviews.documents(f.trip.id)).find(d=>d.id===file.id)!.review,null);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trip_events').get()!.n,1);
 }finally{f.objects.clear();f.sqlite.close();}
});

test('a concurrent owner-role revocation rolls back the review, audit and trip version',async()=>{
 const f=await fixture(),batch=f.db.batch;try{f.db.batch=(async statements=>{f.sqlite.prepare("UPDATE memberships SET role='MEMBER' WHERE user_id='stage-review-owner'").run();return batch(statements);}) as typeof f.db.batch;await assert.rejects(f.reviews.record(f.input),/owner and chronology/);assert.equal((await f.owner.owned('trips',f.trip.id,f.org)).version,2);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trip_stage_reviews').get()!.n,0);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit WHERE action='trip.stage-file.review'").get()!.n,0);}finally{f.db.batch=batch;f.objects.clear();f.sqlite.close();}
});

test('schema-only review migration preserves existing files, issued invoice, receipt and profit',async()=>{
 const f=await fixture('0031');try{const invoice=await f.owner.command('invoice.create',{year:'2026-2027',date:'2026-10-27',ids:[f.booking.id],taxMode:'none'});await f.owner.command('receipt.create',{invoiceId:invoice.id,date:'2026-10-27',amount:100,method:'bank',reference:'Synthetic',requestId:'review-upgrade-receipt'});
  const tables=['trips','trip_allocations','trip_stage_documents','assets','asset_scopes','invoices','invoice_items','invoice_receipts'],before=Object.fromEntries(tables.map(t=>[t,f.sqlite.prepare('SELECT * FROM '+t).all()])),profit=(await f.owner.financeReport('2026-2027')).report.netProfit;
  f.sqlite.exec(readFileSync('drizzle/0031_trip_stage_reviews.sql','utf8'));for(const table of tables)assert.deepEqual(f.sqlite.prepare('SELECT * FROM '+table).all(),before[table],table);assert.equal((await f.owner.financeReport('2026-2027')).report.netProfit,profit);await f.reviews.record(f.input);assert.equal((await f.reviews.history(f.trip.id)).length,1);assert.equal(f.objects.size,1);
 }finally{f.objects.clear();f.sqlite.close();}
});
