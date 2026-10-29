import {test} from 'vitest';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {database} from './helpers/database';
import {TransportService} from '../lib/service';
import {WorkspaceStagePolicies} from '../lib/workspace-stage-policy';
import {TripStageDocuments} from '../lib/trip-stage-documents';
import {TripStageReviews} from '../lib/trip-stage-reviews';

// These are direct SQL link-storage fixtures, before automatic event-link materialization.
async function fixture(before='0033'){
 const {db,sqlite}=database(before),owner=new TransportService(db,{userId:'link-owner',email:'owner@link.test'});await owner.command('workspace.create',{name:'Synthetic link company'});const org=(await owner.member()).org_id;
 await owner.command('consignment.save',{year:'2026-2027',cn:'LINK',date:'2026-10-26',company:'Synthetic customer',truck:'BR01AB1234',origin:'Patna',destination:'Delhi',freight:1000,advance:0});const booking=(await owner.state('2026-2027')).consignments[0],supplier=await owner.command('account.save',{kind:'supplier',code:'LINK',name:'Synthetic carrier'});await new WorkspaceStagePolicies(owner).save({version:1,placement:'accepted_file',loading:'optional',arrival:'optional'},0);
 const trip=await owner.command('trip.create',{consignmentId:booking.id,supplierId:supplier.id,registration:booking.truck,stagePolicy:'workspace_v1',stagePolicyVersion:1,requestId:'stage-link-trip'}),allocationId=(await owner.first('SELECT id FROM trip_allocations WHERE trip_id=?',trip.id))!.id,objects=new Map<string,Uint8Array>(),bucket={put:async(k:string,b:Uint8Array)=>{objects.set(k,b.slice());},delete:async(k:string)=>{objects.delete(k);}} as unknown as R2Bucket;
 const doc=await new TripStageDocuments(owner).upload({tripId:trip.id,stage:'placement',version:1,requestId:'stage-link-file'},{name:'Synthetic link.pdf',type:'application/pdf',bytes:new TextEncoder().encode('%PDF-1.4 synthetic link')},bucket),reviews=new TripStageReviews(owner),review=await reviews.record({tripId:trip.id,documentId:doc.id,kind:'accept',version:2,eventAt:new Date().toISOString(),note:'',requestId:'stage-link-review'});
 return {db,sqlite,owner,org,trip,booking,allocationId,objects,docId:doc.id,reviewId:review.id,reviews};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
// Earlier-schema link-storage fixtures, not service/API transition QA.
function seed(f:Fixture,kind:string,allocationId:string|null=null,parents:string[]=[],uses:{documentId:string;reviewId:string}[]=[],target:string|null=null,extra:Record<string,any>={}){
 const version=Number(f.sqlite.prepare('SELECT version FROM trips WHERE id=?').get(f.trip.id)!.version)+1,id='synthetic-link-event-'+version,at=new Date().toISOString(),transition={contract:'physical_stage_v1',prerequisiteEventIds:parents,evidenceUses:uses,...extra.transition};
 f.sqlite.exec('BEGIN');try{f.sqlite.prepare('UPDATE trips SET version=? WHERE id=?').run(version,f.trip.id);f.sqlite.prepare('INSERT INTO trip_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,f.org,f.trip.id,version,kind,allocationId,target,at,'','Synthetic fixture',JSON.stringify({stageTransition:transition}),extra.actor||'link-owner',at);f.sqlite.exec('COMMIT');}catch(e){f.sqlite.exec('ROLLBACK');throw e;}return id;
}
function use(f:Fixture,eventId:string,documentId=f.docId,reviewId=f.reviewId,org=f.org,tripId=f.trip.id){f.sqlite.prepare('INSERT INTO trip_stage_evidence_uses VALUES(?,?,?,?,?)').run(eventId,documentId,reviewId,org,tripId);}
function dependency(f:Fixture,eventId:string,parent:string,org=f.org,tripId=f.trip.id){f.sqlite.prepare('INSERT INTO trip_stage_event_dependencies VALUES(?,?,?,?)').run(eventId,parent,org,tripId);}
function placement(f:Fixture){const event=seed(f,'placement',null,[],[{documentId:f.docId,reviewId:f.reviewId}]);use(f,event);return event;}

test('exact review use and event dependencies are immutable, scoped metadata without financial effects',async()=>{
 const f=await fixture();try{const invoice=await f.owner.command('invoice.create',{year:'2026-2027',date:'2026-10-27',ids:[f.booking.id],taxMode:'none'});await f.owner.command('receipt.create',{invoiceId:invoice.id,date:'2026-10-27',amount:100,method:'bank',reference:'Synthetic',requestId:'stage-link-receipt'});
  const tables=['consignments','invoices','invoice_items','invoice_receipts','supplier_payments','trip_stage_documents','trip_stage_reviews'],before=Object.fromEntries(tables.map(t=>[t,f.sqlite.prepare('SELECT * FROM '+t).all()])),profit=(await f.owner.financeReport('2026-2027')).report.netProfit;
  const placed=placement(f),loaded=seed(f,'loading',f.allocationId,[placed]);dependency(f,loaded,placed);for(const table of ['trip_stage_evidence_uses','trip_stage_event_dependencies']){assert.throws(()=>f.sqlite.exec('UPDATE '+table+' SET org_id=org_id'),/immutable/);assert.throws(()=>f.sqlite.exec('DELETE FROM '+table),/immutable/);}
  const backup=await f.owner.backup();assert.equal(backup.records.trip_stage_evidence_uses.length,1);assert.equal(backup.records.trip_stage_event_dependencies.length,1);assert.doesNotMatch(JSON.stringify(backup.records.trip_stage_evidence_uses),/%PDF/);for(const table of tables)assert.deepEqual(f.sqlite.prepare('SELECT * FROM '+table).all(),before[table],table);assert.equal((await f.owner.financeReport('2026-2027')).report.netProfit,profit);
 }finally{f.objects.clear();f.sqlite.close();}
});

test('evidence uses reject foreign scope, substituted documents/reviews, stale events and missing original contract',async()=>{
 const f=await fixture();try{const e=seed(f,'placement',null,[],[{documentId:f.docId,reviewId:f.reviewId}]);for(const args of [[f.docId,f.reviewId,'foreign',f.trip.id],[f.docId,f.reviewId,f.org,'foreign'],['foreign-document',f.reviewId,f.org,f.trip.id],[f.docId,'foreign-review',f.org,f.trip.id]])assert.throws(()=>use(f,e,...args as [string,string,string,string]),/exact original/);use(f,e);assert.throws(()=>use(f,e),/UNIQUE/);
  const missing=seed(f,'placement');assert.throws(()=>use(f,missing),/exact original/);const bad=seed(f,'placement',null,[],[{documentId:f.docId,reviewId:f.reviewId}],null,{transition:{contract:'forged'}});assert.throws(()=>use(f,bad),/exact original/);assert.throws(()=>use(f,missing),/exact original/);
  const loading=seed(f,'loading',f.allocationId,[],[{documentId:f.docId,reviewId:f.reviewId}]);assert.throws(()=>use(f,loading),/exact original/);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trip_stage_evidence_uses').get()!.n,1);
 }finally{f.objects.clear();f.sqlite.close();}
});

test('dependency links require original scoped, earlier active prerequisites and current operational membership',async()=>{
 const f=await fixture();try{const p=placement(f),l=seed(f,'loading',f.allocationId,[p]);assert.throws(()=>dependency(f,l,p,'foreign'),/prerequisite link/);assert.throws(()=>dependency(f,l,p,f.org,'foreign'),/prerequisite link/);assert.throws(()=>dependency(f,l,l),/prerequisite link/);dependency(f,l,p);assert.throws(()=>dependency(f,l,p),/UNIQUE/);
  const noRequest=seed(f,'loading',f.allocationId);assert.throws(()=>dependency(f,noRequest,p),/prerequisite link/);const wrongKind=seed(f,'arrival',f.allocationId,[p]);assert.throws(()=>dependency(f,wrongKind,p),/prerequisite link/);
  const late=seed(f,'loading',f.allocationId,[p]);f.sqlite.prepare("UPDATE memberships SET role='OBSERVER' WHERE user_id='link-owner'").run();assert.throws(()=>dependency(f,late,p),/prerequisite link/);f.sqlite.prepare("UPDATE memberships SET role='OWNER' WHERE user_id='link-owner'").run();dependency(f,late,p);assert.throws(()=>dependency(f,noRequest,p),/prerequisite link/);
 }finally{f.objects.clear();f.sqlite.close();}
});

test('dependent events must reverse before their prerequisite and all link history survives',async()=>{
 const f=await fixture();try{const p=placement(f),l=seed(f,'loading',f.allocationId,[p]);dependency(f,l,p);const before=f.sqlite.prepare('SELECT version FROM trips WHERE id=?').get(f.trip.id)!.version;assert.throws(()=>seed(f,'correction',null,[p],[],p),/dependent events/);assert.equal(f.sqlite.prepare('SELECT version FROM trips WHERE id=?').get(f.trip.id)!.version,before);
  const reverseLoad=seed(f,'correction',null,[l],[],l);dependency(f,reverseLoad,l);const reversePlacement=seed(f,'correction',null,[p],[],p);dependency(f,reversePlacement,p);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trip_stage_event_dependencies').get()!.n,3);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trip_stage_evidence_uses').get()!.n,1);for(const event of [p,l,reverseLoad,reversePlacement])assert.throws(()=>f.sqlite.prepare('DELETE FROM trip_events WHERE id=?').run(event),/must be retained/);
 }finally{f.objects.clear();f.sqlite.close();}
});

test('accepted review cannot be corrected while its using event is active, but explicit reversal permits it',async()=>{
 const f=await fixture();try{const p=placement(f),version=Number(f.sqlite.prepare('SELECT version FROM trips WHERE id=?').get(f.trip.id)!.version),at=new Date().toISOString(),payload=JSON.stringify({tripId:f.trip.id,documentId:f.docId,kind:'correction',targetId:f.reviewId,eventAt:at,note:'Synthetic correction'});
  assert.throws(()=>f.sqlite.prepare('INSERT INTO trip_stage_reviews VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run('forged-used-review-correction',f.org,f.trip.id,f.docId,'correction',f.reviewId,version,at,'Synthetic correction',payload,'link-owner','OWNER',at),/stage using this accepted review/);
  const reverse=seed(f,'correction',null,[p],[],p);dependency(f,reverse,p);await f.reviews.record({tripId:f.trip.id,documentId:f.docId,kind:'correction',targetId:f.reviewId,version:version+1,eventAt:new Date().toISOString(),note:'Wrong evidence',requestId:'stage-link-correct-review'});assert.equal((await f.reviews.documents(f.trip.id))[0].review,null);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trip_stage_evidence_uses').get()!.n,1);
 }finally{f.objects.clear();f.sqlite.close();}
});

test('operational event actors can use historically owner-accepted evidence without gaining private file access',async()=>{
 const f=await fixture();try{f.sqlite.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').run('link-dispatcher',f.org,'dispatcher@link.test','DISPATCHER','2026-10-27');const p=seed(f,'placement',null,[],[{documentId:f.docId,reviewId:f.reviewId}],null,{actor:'link-dispatcher'});use(f,p);
  const dispatcher=new TransportService(f.db,{userId:'link-dispatcher',email:'dispatcher@link.test'});await assert.rejects(new TripStageDocuments(dispatcher).file(String(f.sqlite.prepare('SELECT asset_id FROM trip_stage_documents').get()!.asset_id)),/owner/);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trip_stage_evidence_uses').get()!.n,1);
 }finally{f.objects.clear();f.sqlite.close();}
});

test('inactive allocations and non-owner corrections cannot append dependency links',async()=>{
 const f=await fixture();try{const p=placement(f),l=seed(f,'loading',f.allocationId,[p]);f.sqlite.prepare('UPDATE trip_allocations SET active=0 WHERE id=?').run(f.allocationId);assert.throws(()=>dependency(f,l,p),/prerequisite link/);f.sqlite.prepare('UPDATE trip_allocations SET active=1 WHERE id=?').run(f.allocationId);dependency(f,l,p);
  f.sqlite.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').run('link-member',f.org,'member@link.test','MEMBER','2026-10-27');const correction=seed(f,'correction',null,[l],[],l,{actor:'link-member'});assert.throws(()=>dependency(f,correction,l),/prerequisite link/);
 }finally{f.objects.clear();f.sqlite.close();}
});

test('schema-only link migration preserves existing trip, file, acceptance, invoice, receipt and profit',async()=>{
 const f=await fixture('0032');try{const invoice=await f.owner.command('invoice.create',{year:'2026-2027',date:'2026-10-27',ids:[f.booking.id],taxMode:'none'});await f.owner.command('receipt.create',{invoiceId:invoice.id,date:'2026-10-27',amount:100,method:'bank',reference:'Synthetic',requestId:'stage-link-upgrade-receipt'});const tables=['trips','trip_allocations','trip_stage_documents','trip_stage_reviews','invoices','invoice_items','invoice_receipts'],before=Object.fromEntries(tables.map(t=>[t,f.sqlite.prepare('SELECT * FROM '+t).all()])),profit=(await f.owner.financeReport('2026-2027')).report.netProfit;
  f.sqlite.exec(readFileSync('drizzle/0032_trip_stage_event_links.sql','utf8'));for(const table of tables)assert.deepEqual(f.sqlite.prepare('SELECT * FROM '+table).all(),before[table],table);assert.equal((await f.owner.financeReport('2026-2027')).report.netProfit,profit);placement(f);assert.equal(f.objects.size,1);
 }finally{f.objects.clear();f.sqlite.close();}
});
