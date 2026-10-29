import {test} from 'vitest';
import assert from 'node:assert/strict';
import {apiFixture} from './helpers/api';
import {AuthService,cookieName} from '../lib/auth';
import {TransportService} from '../lib/service';
import {TripService} from '../lib/trip-service';
import {TripDocuments} from '../lib/trip-documents';
import {POST as uploadPod} from '../app/api/tms/trip-documents/route';

const endpoint='/api/tms/trip-documents';
const pdf='%PDF-1.4 synthetic route evidence';
function form(data:Record<string,unknown>,file:File|string=new File([pdf],'Synthetic-POD.pdf',{type:'application/pdf'})){
  const body=new FormData();
  for(const [key,value]of Object.entries(data))body.set(key,String(value));
  body.set('file',file);
  return body;
}
async function delivered(owner:TransportService,cn:string){
  await owner.command('consignment.save',{year:'2026-2027',cn,date:'2026-10-26',company:'Synthetic POD customer',truck:'BR01AB1234',origin:'Patna',destination:'Delhi',freight:'1000',advance:'0'});
  const c=(await owner.state('2026-2027')).consignments.find((row:any)=>row.cn===cn)!;
  const supplier=await owner.command('account.save',{kind:'supplier',code:'POD-CARRIER',name:'Synthetic POD carrier'});
  const trip=await owner.command('trip.create',{consignmentId:c.id,supplierId:supplier.id,registration:c.truck,requestId:'pod-trip-'+cn});
  const service=new TripService(owner);
  let state=await service.detail(trip.id);
  await owner.command('trip.event',{tripId:trip.id,version:state.trip.version,kind:'dispatch',eventAt:new Date().toISOString(),requestId:'pod-dispatch-'+cn});
  state=await service.detail(trip.id);
  await owner.command('trip.event',{tripId:trip.id,version:state.trip.version,kind:'delivery',allocationId:state.items[0].id,reference:'Synthetic delivery only',eventAt:new Date().toISOString(),requestId:'pod-delivery-'+cn});
  state=await service.detail(trip.id);
  return {tripId:trip.id,allocationId:state.items[0].id,version:state.trip.version,requestId:'pod-upload-'+cn};
}

test('POD route rejects anonymous, foreign-origin and support-session uploads without storing bytes',async()=>{
  const f=await apiFixture();
  try{
    for(const [options,status]of [[{cookie:''},401],[{origin:'https://untrusted.test'},403],[{cookie:f.getCookie()+'; logistrace_support=invalid'},403]] as const){
      const response=await f.request(endpoint,form({}),options);
      assert.equal(response.status,status);
      assert.equal(response.headers.get('cache-control'),'no-store');
      assert.equal(response.headers.get('x-content-type-options'),'nosniff');
    }
    assert.equal(f.objects.size,0);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trip_documents').get()!.n,0);
  }finally{f.sqlite.close();}
});

test('POD multipart budget covers the whole request and malformed files never reach storage',async()=>{
  const f=await apiFixture();
  try{
    const oversized=form({remark:'x'.repeat(3*1024*1024)});
    // Fully encode before cancellation: Node's lazy multipart encoder can otherwise
    // enqueue after its stream is cancelled, unrelated to the route's byte limit.
    const encoded=new Response(oversized),bytes=await encoded.arrayBuffer();
    assert.equal((await uploadPod(new Request('https://local.test'+endpoint,{method:'POST',headers:{Origin:'https://local.test',Cookie:f.getCookie(),'Content-Type':encoded.headers.get('content-type')!},body:bytes}))).status,413);
    assert.equal((await f.request(endpoint,new FormData())).status,400);
    assert.equal((await f.request(endpoint,form({},'a string is not a file'))).status,400);
    const data={requestId:'invalid-pod-request'};
    assert.equal((await f.request(endpoint,form(data,new File(['not PDF'],'Forged.pdf',{type:'application/pdf'})))).status,400);
    assert.equal((await f.request(endpoint,form(data,new File(['plain text'],'Other.txt',{type:'text/plain'})))).status,400);
    assert.equal(f.objects.size,0);
  }finally{f.sqlite.close();}
});

test('commercial members and dispatchers cannot upload owner-reviewed trip evidence',async()=>{
  const f=await apiFixture();
  try{
    const org=(await f.owner.member()).org_id;
    for(const role of ['MEMBER','DISPATCHER']){
      const id='pod-api-'+role,version='pod-version-'+role,email=role.toLowerCase()+'@pod.test';
      f.sqlite.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').run(id,org,email,role,'2026-10-27');
      f.sqlite.prepare('INSERT INTO password_accounts VALUES(?,?,?,?,0,?)').run(id,email,'google-only$synthetic',version,'2026-10-27');
      const token=await new AuthService(f.db).issue(id,version);
      assert.equal((await f.request(endpoint,form({}),{cookie:`${cookieName()}=${token}`})).status,403);
    }
    assert.equal(f.objects.size,0);
  }finally{f.sqlite.close();}
});

test('POD upload fails closed when storage is unavailable or customer access has expired',async()=>{
  const f=await apiFixture();
  try{
    const bucket=f.env.BUCKET;
    const db=f.env.DB;
    delete f.env.DB;
    assert.equal((await f.request(endpoint,form({}))).status,503);
    f.env.DB=db;
    delete f.env.BUCKET;
    assert.equal((await f.request(endpoint,form({}))).status,503);
    f.env.BUCKET=bucket;
    f.env.BILLING_ADMIN_USER_ID='separate-platform-owner';
    const org=(await f.owner.member()).org_id;
    f.sqlite.prepare('INSERT INTO subscriptions(org_id,trial_started_at,trial_ends_at) VALUES(?,?,?)').run(org,'2019-12-01T00:00:00.000Z','2020-01-01T00:00:00.000Z');
    assert.equal((await f.request(endpoint,form({}))).status,402);
    assert.equal(f.objects.size,0);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trip_documents').get()!.n,0);
  }finally{f.sqlite.close();}
});

test('delivered POD upload retries retain one private file and do not recognize extra revenue or payments',async()=>{
  const f=await apiFixture();
  try{
    const data=await delivered(f.owner,'POD-API-1');
    // Exercise ordinary trial access without the platform administrator shortcut.
    delete f.env.BILLING_ADMIN_USER_ID;
    const before=f.sqlite.prepare('SELECT id,freight,advance FROM consignments ORDER BY id').all();
    const response=await f.request(endpoint,form(data));
    assert.equal(response.status,200,await response.clone().text());
    const result=await response.json() as any;
    const retry=await f.request(endpoint,form(data));
    assert.equal(retry.status,200);
    assert.equal((await retry.json() as any).alreadyRecorded,true);
    const document=f.sqlite.prepare('SELECT * FROM trip_documents WHERE id=?').get(result.id)!;
    const download=await f.request('/api/tms?asset='+document.asset_id);
    assert.equal(download.status,200);
    assert.equal(download.headers.get('cache-control'),'no-store');
    assert.equal(await download.text(),pdf);
    assert.equal((await f.request('/api/tms?asset='+document.asset_id,undefined,{cookie:''})).status,401);
    assert.equal((await f.request(endpoint,form(data,new File([pdf+' changed'],'Synthetic-POD.pdf',{type:'application/pdf'})))).status,409);
    assert.equal((await f.request(endpoint,form({...data,requestId:'another-pod-upload'}))).status,409);
    assert.equal(f.objects.size,1);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trip_documents').get()!.n,1);
    assert.deepEqual(f.sqlite.prepare('SELECT id,freight,advance FROM consignments ORDER BY id').all(),before);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM invoices').get()!.n,0);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM invoice_receipts').get()!.n,0);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM supplier_payments').get()!.n,0);
  }finally{f.sqlite.close();}
});

test.each([
  ['UNIQUE constraint failed: trip_documents.id',409,'This upload conflicts with a recent change. Reload and try again.'],
  ['',400,'Upload failed.'],
] as const)('POD database failure %s removes staged bytes and leaves financial and trip history intact',async(message,status,error)=>{
  const f=await apiFixture();
  try{
    const data=await delivered(f.owner,'POD-ROLLBACK');
    await f.request('/api/billing');
    const before=f.sqlite.prepare('SELECT id,version,status FROM trips ORDER BY id').all();
    let staged=0,deleted=0;
    const put=f.env.BUCKET.put,remove=f.env.BUCKET.delete;
    f.env.BUCKET.put=async(...args:any[])=>{staged++;return put(...args);};
    f.env.BUCKET.delete=async(...args:any[])=>{deleted++;return remove(...args);};
    f.db.batch=async()=>{throw new Error(message);};
    const response=await f.request(endpoint,form(data));
    assert.equal(response.status,status);
    assert.equal((await response.json() as any).error,error);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(staged,1);
    assert.equal(deleted,1);
    assert.equal(f.objects.size,0);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trip_documents').get()!.n,0);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM assets').get()!.n,0);
    assert.deepEqual(f.sqlite.prepare('SELECT id,version,status FROM trips ORDER BY id').all(),before);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM invoice_receipts').get()!.n,0);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM supplier_payments').get()!.n,0);
  }finally{f.sqlite.close();}
});

test('POD request without multipart content type rejects before document storage',async()=>{
  const f=await apiFixture();
  try{
    const response=await uploadPod(new Request('https://local.test'+endpoint,{method:'POST',headers:{Origin:'https://local.test',Cookie:f.getCookie()},body:new Uint8Array()}));
    assert.equal(response.status,400);
    assert.equal(response.headers.get('x-content-type-options'),'nosniff');
    assert.equal(f.objects.size,0);
  }finally{f.sqlite.close();}
});

test('a workspace owner cannot upload or download another workspace trip evidence',async()=>{
  const f=await apiFixture();
  try{
    const other=new TransportService(f.db,{userId:'pod-other-owner',email:'other@pod.test'});
    await other.command('workspace.create',{name:'Synthetic other POD business'});
    const data=await delivered(other,'POD-OTHER');
    assert.equal((await f.request(endpoint,form(data))).status,404);
    const own=await delivered(f.owner,'POD-OWN');
    assert.equal((await f.request(endpoint,form({...own,allocationId:data.allocationId}))).status,400);
    assert.equal(f.objects.size,0);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trip_documents').get()!.n,0);
    const uploaded=await new TripDocuments(other).upload(data,{name:'Other-business.pdf',type:'application/pdf',bytes:new TextEncoder().encode(pdf)},f.env.BUCKET);
    const document=f.sqlite.prepare('SELECT asset_id FROM trip_documents WHERE id=?').get(uploaded.id)!;
    assert.equal((await f.request('/api/tms?asset='+document.asset_id)).status,404);
    assert.equal(f.objects.size,1);
  }finally{f.sqlite.close();}
});
