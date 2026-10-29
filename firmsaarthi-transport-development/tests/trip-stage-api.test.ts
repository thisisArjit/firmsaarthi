import {test} from 'vitest';
import assert from 'node:assert/strict';
import {apiFixture} from './helpers/api';
import {AuthService,cookieName} from '../lib/auth';
import {TransportService} from '../lib/service';
import {WorkspaceStagePolicies} from '../lib/workspace-stage-policy';
import {POST as upload} from '../app/api/tms/stage-documents/route';
import {POST as review} from '../app/api/tms/stage-reviews/route';
import {workspaceFetch} from '../lib/workspace-sync';

const documents='/api/tms/stage-documents',reviews='/api/tms/stage-reviews',pdf='%PDF-1.4 synthetic stage API';
function form(data:Record<string,unknown>,file:File|string=new File([pdf],'Synthetic stage.pdf',{type:'application/pdf'})){
 const body=new FormData();for(const [key,value]of Object.entries(data))body.set(key,String(value));body.set('file',file);return body;
}
async function planned(f:Awaited<ReturnType<typeof apiFixture>>){
 await f.seed();const booking=(await f.owner.state('2026-2027')).consignments[0],supplier=await f.owner.command('account.save',{kind:'supplier',code:'STAGE-API',name:'Synthetic stage supplier'});await new WorkspaceStagePolicies(f.owner).save({version:1,placement:'accepted_file',loading:'accepted_file',arrival:'accepted_file'},0);
 const trip=await f.owner.command('trip.create',{consignmentId:booking.id,supplierId:supplier.id,registration:booking.truck,stagePolicy:'workspace_v1',stagePolicyVersion:1,requestId:'stage-api-trip'});
 return {tripId:trip.id,stage:'placement',version:1,requestId:'stage-api-file'};
}
function decision(tripId:string,documentId:string,extra:Record<string,unknown>={}){return {tripId,documentId,kind:'accept',version:2,eventAt:new Date().toISOString(),note:'',requestId:'stage-api-review',...extra};}
async function uploaded(f:Awaited<ReturnType<typeof apiFixture>>){const input=await planned(f),response=await f.request(documents,form(input));assert.equal(response.status,200,await response.clone().text());const data=await response.json() as any;return {input,id:data.id,assetId:String(f.sqlite.prepare('SELECT asset_id FROM trip_stage_documents WHERE id=?').get(data.id)!.asset_id)};}
function privateHeaders(r:Response){assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('x-content-type-options'),'nosniff');}

test('stage endpoints reject anonymous, support and foreign-origin requests before consuming bodies',async()=>{
 const f=await apiFixture();try{
  for(const cookie of ['',f.getCookie()+'; logistrace_support=invalid'])for(const [path,body]of [[documents+'?tripId=missing',undefined],[documents,form({})],[reviews,{}]] as const){const r=await f.request(path,body,{cookie});assert.equal(r.status,cookie?403:401);privateHeaders(r);}
  for(const path of [documents,reviews]){const r=await f.request(path,{}, {origin:'https://untrusted.test'});assert.equal(r.status,403);privateHeaders(r);}
  let reads=0;const body=new ReadableStream<Uint8Array>({pull(controller){reads++;controller.enqueue(new Uint8Array([1]));controller.close();}},{highWaterMark:0});const r=await upload(new Request('https://local.test'+documents,{method:'POST',headers:{Origin:'https://local.test','Content-Type':'multipart/form-data; boundary=x'},body,duplex:'half'} as RequestInit));assert.equal(r.status,401);assert.equal(reads,0);assert.equal(f.objects.size,0);
 }finally{f.objects.clear();f.sqlite.close();}
});

test('all stage file and review capabilities require the current owner role',async()=>{
 const f=await apiFixture();try{const org=(await f.owner.member()).org_id;
  for(const role of ['MEMBER','DISPATCHER']){const id='stage-api-'+role,email=role+'@stage-api.test',version='synthetic-'+role;f.sqlite.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').run(id,org,email,role,'2026-10-27');f.sqlite.prepare('INSERT INTO password_accounts VALUES(?,?,?,?,0,?)').run(id,email,'google-only$synthetic',version,'2026-10-27');const cookie=`${cookieName()}=${await new AuthService(f.db).issue(id,version)}`;
   for(const [path,body]of [[documents+'?tripId=missing',undefined],[documents+'?assetId=missing',undefined],[documents,form({})],[reviews,{}]] as const)assert.equal((await f.request(path,body,{cookie})).status,403);
  }
  assert.equal(f.objects.size,0);
 }finally{f.objects.clear();f.sqlite.close();}
});

test('upload, read snapshot, download and review retries preserve scope, accounting and immutable originals',async()=>{
 const f=await apiFixture();try{const input=await planned(f);delete f.env.BILLING_ADMIN_USER_ID;
  const booking=(await f.owner.state('2026-2027')).consignments[0],invoice=await f.owner.command('invoice.create',{year:'2026-2027',date:'2026-10-27',ids:[booking.id],taxMode:'none'});await f.owner.command('receipt.create',{invoiceId:invoice.id,date:'2026-10-27',amount:100,method:'bank',reference:'Synthetic route receipt',requestId:'stage-api-receipt'});
  const tables=['consignments','invoices','invoice_items','invoice_receipts','supplier_payments','trip_events'],before=Object.fromEntries(tables.map(t=>[t,f.sqlite.prepare('SELECT * FROM '+t).all()])),profit=(await f.owner.financeReport('2026-2027')).report.netProfit;
  const r=await f.request(documents,form(input,new File([pdf],'Statement "\r\n ₹.pdf',{type:'application/pdf'})));assert.equal(r.status,200,await r.clone().text());privateHeaders(r);const saved=await r.json() as any,id=saved.id,assetId=f.sqlite.prepare('SELECT asset_id FROM trip_stage_documents WHERE id=?').get(id)!.asset_id;
  assert.equal((await(await f.request(documents,form({...input},new File([pdf],'Statement "\r\n ₹.pdf',{type:'application/pdf'})))).json() as any).alreadyRecorded,true);
  const download=await f.request(documents+'?assetId='+assetId);assert.equal(download.status,200);privateHeaders(download);assert.equal(download.headers.get('content-type'),'application/pdf');assert.match(download.headers.get('content-disposition')!,/^attachment; filename="stage-document.pdf"; filename\*=UTF-8''/);assert.doesNotMatch(download.headers.get('content-disposition')!,/[\r\n]/);assert.equal(download.headers.get('content-security-policy'),"sandbox; default-src 'none'");assert.equal(await download.text(),pdf);
  const d=decision(input.tripId,id);assert.equal((await f.request(reviews,d)).status,200);assert.equal((await(await f.request(reviews,d)).json() as any).alreadyRecorded,true);assert.equal((await f.request(reviews,{...d,note:'Changed'})).status,409);
  const state=await f.request(documents+'?tripId='+input.tripId);privateHeaders(state);const body=await state.json() as any;assert.equal(body.version,3);assert.equal(body.status,'planned');assert.equal(body.documents.length,1);assert.equal(body.reviews.length,1);assert.equal(body.reviews[0].actor_role,'OWNER');assert.equal(body.reviews[0].document_id,id);assert.equal(body.documents[0].payload,undefined);assert.equal(body.reviews[0].payload,undefined);
  const rejection=await f.request(reviews,decision(input.tripId,id,{kind:'reject',note:'Bad scan',version:3,requestId:'stage-second-review'}));assert.equal(rejection.status,400);assert.equal((await f.request('/api/tms?asset='+assetId)).status,403); // Generic asset route stays fail-closed.
  const blocked=await f.request('/api/tms',{action:'trip.event',data:{tripId:input.tripId,version:3,kind:'dispatch',eventAt:new Date().toISOString(),requestId:'stage-api-missing-placement'}});assert.equal(blocked.status,400);assert.match((await blocked.json() as any).error,/placement/);
  for(const table of tables)assert.deepEqual(f.sqlite.prepare('SELECT * FROM '+table).all(),before[table],table);assert.equal((await f.owner.financeReport('2026-2027')).report.netProfit,profit);assert.equal(f.objects.size,1);
 }finally{f.objects.clear();f.sqlite.close();}
});

test('cross-tenant trip, document and asset substitution never exposes metadata or bytes',async()=>{
 const f=await apiFixture();try{const saved=await uploaded(f),foreign=new TransportService(f.db,{userId:'stage-api-foreign',email:'foreign@stage-api.test'});await foreign.command('workspace.create',{name:'Foreign synthetic business'});f.sqlite.prepare('INSERT INTO password_accounts VALUES(?,?,?,?,0,?)').run('stage-api-foreign','foreign@stage-api.test','google-only$synthetic','foreign-version','2026-10-27');const cookie=`${cookieName()}=${await new AuthService(f.db).issue('stage-api-foreign','foreign-version')}`;
  for(const [path,body]of [[documents+'?tripId='+saved.input.tripId,undefined],[documents+'?assetId='+saved.assetId,undefined],[documents,form(saved.input)],[reviews,decision(saved.input.tripId,saved.id)]] as const){const r=await f.request(path,body,{cookie});assert.equal(r.status,404,await r.clone().text());privateHeaders(r);assert.doesNotMatch(await r.text(),/Synthetic stage.pdf|synthetic stage API/);}
  assert.equal((await f.request(reviews,decision(saved.input.tripId,saved.assetId))).status,404);assert.equal((await f.request(documents+'?assetId='+saved.id)).status,404);assert.equal(f.objects.size,1);
 }finally{f.objects.clear();f.sqlite.close();}
});

test('strict query and multipart fields reject selectors, duplicate fields, coerced versions and wrong files',async()=>{
 const f=await apiFixture();try{const input=await planned(f);
  for(const query of ['', '?tripId=x&tripId=y','?tripId=x&orgId=other','?assetId=x&tripId=y','?tripId=%20bad','?assetId='+('x'.repeat(201))])assert.equal((await f.request(documents+query)).status,400);
  for(const extra of [{orgId:'other'},{actor:'someone'},{version:'1e0'},{version:' 1'},{version:'9007199254740992'},{allocationId:'foreign-allocation'},{stage:'POD'}])assert.ok((await f.request(documents,form({...input,...extra}))).status>=400);
  const duplicate=form(input);duplicate.append('stage','loading');assert.equal((await f.request(documents,duplicate)).status,400);const binary=form(input);binary.set('requestId',new File(['x'],'bad'));assert.equal((await f.request(documents,binary)).status,400);
  for(const file of ['text',new File(['bad'],'bad.pdf',{type:'application/pdf'}),new File([pdf],'bad.svg',{type:'image/svg+xml'}),new File([],'empty.pdf',{type:'application/pdf'}),new File([new Uint8Array(2097153)],'large.pdf',{type:'application/pdf'})])assert.ok((await f.request(documents,form(input,file))).status>=400);
  assert.equal((await f.request(documents+'?orgId=other',form(input))).status,400);assert.equal(f.objects.size,0);
 }finally{f.objects.clear();f.sqlite.close();}
});

test('whole-body budgets, media and malformed payloads fail before storage or review',async()=>{
 const f=await apiFixture();try{const input=await planned(f),headers={Origin:'https://local.test',Cookie:f.getCookie()};
  const encoded=new Response(form({...input,oversized:'x'.repeat(3*1024*1024)})),bytes=await encoded.arrayBuffer();const tooLarge=await upload(new Request('https://local.test'+documents,{method:'POST',headers:{...headers,'Content-Type':encoded.headers.get('content-type')!,'Content-Length':'1'},body:bytes}));assert.equal(tooLarge.status,413);privateHeaders(tooLarge);
  for(const type of ['application/json','text/plain'])assert.equal((await upload(new Request('https://local.test'+documents,{method:'POST',headers:{...headers,'Content-Type':type},body:'{}'}))).status,415);
  assert.equal((await upload(new Request('https://local.test'+documents,{method:'POST',headers:{...headers,'Content-Type':'multipart/form-data; boundary=bad'},body:'not multipart'}))).status,400);
  for(const body of ['{','[]','null',JSON.stringify({tripId:'x',orgId:'other'}),new Uint8Array([255,254])])assert.equal((await review(new Request('https://local.test'+reviews,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body}))).status,400);
  assert.equal((await review(new Request('https://local.test'+reviews,{method:'POST',headers:{...headers,'Content-Type':'text/plain'},body:'{}'}))).status,415);
  assert.equal((await review(new Request('https://local.test'+reviews,{method:'POST',headers:{...headers,'Content-Type':'application/json','Content-Length':'1'},body:JSON.stringify({note:'₹'.repeat(4000)})}))).status,413);
  const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(8193));controller.close();}});assert.equal((await review(new Request('https://local.test'+reviews,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:stream,duplex:'half'} as RequestInit))).status,413);assert.equal(f.objects.size,0);
 }finally{f.objects.clear();f.sqlite.close();}
});

test('expired access, unavailable storage and missing objects fail closed with private error headers',async()=>{
 const f=await apiFixture();try{const org=(await f.owner.member()).org_id;f.sqlite.prepare('INSERT INTO subscriptions(org_id,trial_started_at,trial_ends_at) VALUES(?,?,?)').run(org,'2019-12-01T00:00:00.000Z','2020-01-01T00:00:00.000Z');const saved=await uploaded(f),bucket=f.env.BUCKET,db=f.env.DB;
  delete f.env.BUCKET;assert.equal((await f.request(documents+'?assetId='+saved.assetId)).status,503);assert.equal((await f.request(documents,form(saved.input))).status,503);assert.equal((await f.request(documents+'?tripId='+saved.input.tripId)).status,200);f.env.BUCKET=bucket;
  f.objects.clear();assert.equal((await f.request(documents+'?assetId='+saved.assetId)).status,404);delete f.env.DB;for(const [path,body]of [[documents+'?tripId=x',undefined],[documents,form(saved.input)],[reviews,decision(saved.input.tripId,saved.id)]] as const)assert.equal((await f.request(path,body)).status,503);f.env.DB=db;
  f.env.BILLING_ADMIN_USER_ID='separate-platform-owner';
  for(const [path,body]of [[documents+'?tripId='+saved.input.tripId,undefined],[documents+'?assetId='+saved.assetId,undefined],[documents,form(saved.input)],[reviews,decision(saved.input.tripId,saved.id)]] as const){const r=await f.request(path,body);assert.equal(r.status,402);privateHeaders(r);}
 }finally{f.objects.clear();f.sqlite.close();}
});

test('unexpected storage/database details stay opaque and failed review writes preserve version/history',async()=>{
 const f=await apiFixture();try{const saved=await uploaded(f),batch=f.db.batch,before=f.sqlite.prepare('SELECT version,status FROM trips WHERE id=?').get(saved.input.tripId);f.db.batch=async()=>{throw Error('Synthetic private database detail');};
  for(const [path,body]of [[documents+'?tripId='+saved.input.tripId,undefined],[reviews,decision(saved.input.tripId,saved.id)]] as const){const r=await f.request(path,body);assert.equal(r.status,500);privateHeaders(r);assert.doesNotMatch(await r.text(),/Synthetic private database detail/);}
  assert.deepEqual(f.sqlite.prepare('SELECT version,status FROM trips WHERE id=?').get(saved.input.tripId),before);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trip_stage_reviews').get()!.n,0);f.db.batch=batch;f.env.BUCKET.get=async()=>{throw Error('Synthetic private storage detail');};const r=await f.request(documents+'?assetId='+saved.assetId);assert.equal(r.status,500);assert.doesNotMatch(await r.text(),/Synthetic private storage detail/);
 }finally{f.objects.clear();f.sqlite.close();}
});

test('successful stage writes invalidate pending reads while denied writes preserve their revision',async()=>{
 const fetch=globalThis.fetch;try{for(const path of [documents,reviews])for(const status of [200,409]){let finish:(r:Response)=>void=()=>{},reads=0;globalThis.fetch=(async(_input:RequestInfo|URL,init?:RequestInit)=>{if(init?.method==='POST')return Response.json({},{status});reads++;return reads===1?new Promise<Response>(resolve=>{finish=resolve;}):Response.json({version:3});}) as typeof fetch;const pending=workspaceFetch(documents+'?tripId=synthetic');await workspaceFetch(path,{method:'POST',body:'{}'});finish(Response.json({version:2}));assert.equal((await(await pending).json() as any).version,status===200?3:2);assert.equal(reads,status===200?2:1);}}finally{globalThis.fetch=fetch;}
});

test('stale API mutations and database failures retain history, while an explicit correction clears the active review',async()=>{
 const f=await apiFixture();try{const saved=await uploaded(f),d=decision(saved.input.tripId,saved.id);assert.equal((await f.request(reviews,d)).status,200);
  assert.equal((await f.request(documents,form({...saved.input,requestId:'stage-stale-new-upload'}))).status,409);assert.equal((await f.request(reviews,{...d,requestId:'stage-stale-new-review'})).status,409);assert.equal((await(await f.request(documents,form(saved.input))).json() as any).alreadyRecorded,true);
  const existing=f.sqlite.prepare('SELECT id FROM trip_stage_reviews').get()!,correct={...d,kind:'correction',targetId:existing.id,version:3,eventAt:new Date().toISOString(),note:'Wrong file decision',requestId:'stage-api-correction'};
  for(const extra of [{orgId:'foreign'},{actor:'other'},{version:'3'},{note:''},{targetId:saved.id},{documentId:saved.assetId}])assert.ok((await f.request(reviews,{...correct,...extra})).status>=400);
  const batch=f.db.batch;f.db.batch=async()=>{throw Error('Synthetic SQL secret');};const failed=await f.request(documents,form({...saved.input,version:3,requestId:'stage-failed-new-upload'}));assert.equal(failed.status,500);assert.doesNotMatch(await failed.text(),/Synthetic SQL secret/);f.db.batch=batch;assert.equal(f.objects.size,1);assert.equal(f.sqlite.prepare('SELECT version FROM trips WHERE id=?').get(saved.input.tripId)!.version,3);
  assert.equal((await f.request(reviews,correct)).status,200);const snapshot=await(await f.request(documents+'?tripId='+saved.input.tripId)).json() as any;assert.equal(snapshot.version,4);assert.equal(snapshot.reviews.length,2);assert.equal(snapshot.reviews[1].target_id,snapshot.reviews[0].id);assert.equal((await(await f.request(reviews,correct)).json() as any).alreadyRecorded,true);
  assert.equal((await f.request(reviews,{...d,version:4,eventAt:new Date().toISOString(),kind:'reject',note:'Unreadable scan',requestId:'stage-api-new-rejection'})).status,200);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trip_events').get()!.n,0);
 }finally{f.objects.clear();f.sqlite.close();}
});

test('a committed review response error recovers through the API without duplicating its audit or decision',async()=>{
 const f=await apiFixture();try{const saved=await uploaded(f),batch=f.db.batch;let once=true;f.db.batch=(async statements=>{const result=await batch(statements);if(once&&statements.some(s=>(s as unknown as {sql:string}).sql.includes('INSERT INTO trip_stage_reviews'))){once=false;throw Error('Synthetic response lost after commit');}return result;}) as typeof f.db.batch;
  const r=await f.request(reviews,decision(saved.input.tripId,saved.id));assert.equal(r.status,200);assert.equal((await r.json() as any).alreadyRecorded,true);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trip_stage_reviews').get()!.n,1);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit WHERE action='trip.stage-file.review'").get()!.n,1);assert.equal(f.objects.size,1);
 }finally{f.objects.clear();f.sqlite.close();}
});
