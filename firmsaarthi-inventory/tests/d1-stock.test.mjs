import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {Worker} from 'node:worker_threads';
import {openStock,provision} from '../lib/stock.mjs';
import {D1Stock} from '../lib/d1-stock.mjs';
import {d1Harness} from './d1-harness.mjs';
async function fixture(path,options){const sqlite=openStock(path);provision(sqlite,{orgId:'business-a',userId:'owner-a',name:'Synthetic A'});const db=d1Harness(sqlite,options),stock=new D1Stock(db,{orgId:'business-a',userId:'owner-a'}),item=await stock.item({sku:'A',name:'Test goods',unit:'kg'}),warehouse=await stock.warehouse({code:'MAIN',name:'Test warehouse'});return {sqlite,db,stock,item,warehouse};}
const input=(f,kind,quantity,requestId='movement-001',extra={})=>({kind,quantity,itemId:f.item.id,warehouseId:f.warehouse.id,requestId,reason:'Synthetic local test',...extra});
const amount=async f=>(await f.stock.state()).balances[0]?.quantity||0;

test('D1 contract receive/issue/adjust/reverse reconciles and pages immutable history',async()=>{const f=await fixture();try{
 const receipt=await f.stock.post(input(f,'receive','10.125'));await f.stock.post(input(f,'issue','0.125','movement-002'));
 const adjust=await f.stock.post(input(f,'adjust_out','2','movement-003',{expectedVersion:2}));
 await f.stock.post({kind:'reverse',reverses:adjust.id,requestId:'reverse-001',reason:'Count correction'});
 assert.equal(await amount(f),10000000);let first=await f.stock.history(f.item.id,f.warehouse.id,{limit:2}),second=await f.stock.history(f.item.id,f.warehouse.id,{limit:2,after:first.next});
 assert.equal(first.records.length,2);assert.equal(second.records.length,2);assert.equal(second.next,null);assert.equal([...first.records,...second.records].reduce((n,r)=>n+r.delta,0),10000000);
 await assert.rejects(f.stock.history(f.item.id,f.warehouse.id,{after:-1}),/page/);
 assert.throws(()=>f.sqlite.prepare('DELETE FROM movements WHERE id=?').run(receipt.id),/immutable/);
}finally{f.sqlite.close();}});

test('D1 contract replay works after new stock changes; conflicting actor/payload and revoked replay denied',async()=>{const f=await fixture();try{
 const original=input(f,'adjust_in','10','movement-001',{expectedVersion:0}),a=await f.stock.post(original);await f.stock.post(input(f,'issue','1','movement-002'));
 assert.equal((await f.stock.post(original)).id,a.id);assert.equal((await f.stock.post(original)).replayed,true);
 await assert.rejects(f.stock.post({...original,quantity:'11'}),/already used/);
 f.sqlite.prepare("INSERT INTO members VALUES('business-a','other','owner')").run();
 await assert.rejects(new D1Stock(f.db,{orgId:'business-a',userId:'other'}).post(original),/already used/);
 f.sqlite.prepare("UPDATE members SET role='disabled' WHERE user_id='owner-a'").run();
 await assert.rejects(f.stock.post(original),/access/);await assert.rejects(f.stock.state(),/access/);
}finally{f.sqlite.close();}});

test('D1 contract rejects a count becoming stale between preflight and batch',async()=>{let inject=false;const f=await fixture(undefined,{beforeBatch(statements){if(inject&&statements[0].sql.startsWith('INSERT INTO movements')){inject=false;f.sqlite.prepare('INSERT INTO movements VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run('intervening','business-a',f.item.id,f.warehouse.id,'receive',1000000,'Concurrent receipt','intervening-001','{}','owner-a',new Date().toISOString(),null,null);}}});try{
 await f.stock.post(input(f,'receive','10'));inject=true;
 await assert.rejects(f.stock.post(input(f,'adjust_out','2','movement-002',{expectedVersion:1})),/Stock changed/);
 assert.equal(await amount(f),11000000);assert.equal((await f.stock.history(f.item.id,f.warehouse.id)).records.length,2);
}finally{f.sqlite.close();}});

test('D1 contract rechecks authorization inside write and scopes tenant/master reads',async()=>{let revoke=false;const f=await fixture(undefined,{beforeBatch(statements){if(revoke&&statements[0].sql.startsWith('INSERT INTO movements')){revoke=false;f.sqlite.prepare("UPDATE members SET role='viewer' WHERE user_id='owner-a'").run();}}});try{
 revoke=true;await assert.rejects(f.stock.post(input(f,'receive','2')),/permission/);assert.equal(await amount(f),0);
 await assert.rejects(f.stock.item({sku:'B',name:'Denied',unit:'each'}),/Owner/);
 await assert.rejects(f.stock.warehouse({code:'B',name:'Denied'}),/Owner/);
 provision(f.sqlite,{orgId:'business-b',userId:'owner-b',name:'Synthetic B'});const b=new D1Stock(f.db,{orgId:'business-b',userId:'owner-b'});
 assert.equal((await b.history(f.item.id,f.warehouse.id)).records.length,0);
 await assert.rejects(b.post(input(f,'receive','2')),/Active/);await assert.rejects(new D1Stock(f.db,{orgId:'business-a',userId:'owner-b'}).state(),/access/);
}finally{f.sqlite.close();}});

test('D1 contract underflow and invalid reversal roll back ledger and balance together',async()=>{const f=await fixture();try{
 const receipt=await f.stock.post(input(f,'receive','5'));await f.stock.post(input(f,'issue','4','movement-002'));
 await assert.rejects(f.stock.post(input(f,'issue','2','movement-003')),/Insufficient/);
 await assert.rejects(f.stock.post({kind:'reverse',reverses:receipt.id,requestId:'reverse-001',reason:'Consumed receipt'}),/Insufficient/);
 assert.equal(await amount(f),1000000);assert.equal((await f.stock.history(f.item.id,f.warehouse.id)).records.length,2);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM movements WHERE request_id IN ('movement-003','reverse-001')").get().n,0);
}finally{f.sqlite.close();}});

async function race(f,inputs){
 const workers=inputs.map(input=>new Worker(new URL('./d1-worker.mjs',import.meta.url),{workerData:{path:f.path,input}}));
 try{return await Promise.all(workers.map(worker=>new Promise((resolve,reject)=>{worker.on('message',message=>{if(message.ready){if(workers.every(w=>w.prepared))return;worker.prepared=true;if(workers.every(w=>w.prepared))for(const w of workers)w.postMessage('commit');}else resolve(message);});worker.once('error',reject);worker.once('exit',code=>{if(code!==0)reject(Error('Worker failed'));});})));}
 finally{await Promise.all(workers.map(w=>w.terminate()));}
}
for(const duplicate of [false,true])test(`D1 SQL contract independent connections ${duplicate?'replay same intent once':'cannot oversell concurrent issues'}`,async()=>{
 const root=resolve(mkdtempSync(join(tmpdir(),'firmsaarthi-d1-test-'))),path=join(root,'stock.db'),f=await fixture(path);f.path=path;
 try{await f.stock.post(input(f,'receive','10'));const attempts=[input(f,'issue','7','parallel-001'),input(f,'issue','7',duplicate?'parallel-001':'parallel-002')],results=await race(f,attempts);
 assert.equal(results.filter(r=>r.success).length,duplicate?2:1);if(duplicate){assert.equal(results[0].id,results[1].id);assert.equal(results.filter(r=>r.replayed).length,1);}else assert.equal(results.filter(r=>r.error==='Insufficient stock.').length,1);
 assert.equal(await amount(f),3000000);assert.equal((await f.stock.history(f.item.id,f.warehouse.id)).records.length,2);
 }finally{f.sqlite.close();if(!root.startsWith(resolve(tmpdir())+sep)||!root.includes('firmsaarthi-d1-test-'))throw Error('Unsafe synthetic cleanup');rmSync(root,{recursive:true,force:true});}
});
