import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,sep} from 'node:path';
import {Worker} from 'node:worker_threads';
import {openStock,provision} from '../lib/stock.mjs';
import {startWorkspace} from '../lib/workspace-start.mjs';
import {d1Harness} from './d1-harness.mjs';
import {inventoryHttp} from '../lib/http.mjs';
const native={userId:'synthetic-new-owner',siteId:'inventory-test'},input={name:'Synthetic first workspace',requestId:'create-workspace-001'};

test('explicit native owner creation and replay produce one separate empty workspace',async()=>{const sqlite=openStock(),db=d1Harness(sqlite);try{
 const first=await startWorkspace(db,native,'inventory-test',input),again=await startWorkspace(db,native,'inventory-test',input);assert.equal(first.replayed,false);assert.equal(again.replayed,true);assert.equal(first.workspace,again.workspace);assert.equal(sqlite.prepare('SELECT count(*) n FROM members').get().n,1);assert.equal(sqlite.prepare('SELECT count(*) n FROM workspaces').get().n,1);assert.equal(sqlite.prepare('SELECT count(*) n FROM items').get().n,0);assert.equal(sqlite.prepare('SELECT role FROM members').get().role,'owner');
 await assert.rejects(startWorkspace(db,native,'inventory-test',{...input,name:'Changed name'}),e=>e.status===409);await assert.rejects(startWorkspace(db,native,'inventory-test',{...input,requestId:'different-request'}),e=>e.status===409);assert.equal(sqlite.prepare('SELECT count(*) n FROM workspaces').get().n,1);
 }finally{sqlite.close();}});

test('workspace creation never adopts email, foreign Site identity or existing/disabled members',async()=>{const sqlite=openStock(),db=d1Harness(sqlite);try{
 for(const identity of [null,{email:'owner@example.test',siteId:'inventory-test'},{...native,siteId:'transport-test'}])await assert.rejects(startWorkspace(db,identity,'inventory-test',input),e=>e.status===403);
 await assert.rejects(startWorkspace(db,{userId:native.userId},undefined,input),e=>e.status===403);
 provision(sqlite,{orgId:'existing',userId:native.userId,name:'Existing synthetic workspace'});await assert.rejects(startWorkspace(db,native,'inventory-test',input),e=>e.status===403);sqlite.prepare("UPDATE members SET role='disabled'").run();await assert.rejects(startWorkspace(db,native,'inventory-test',input),e=>e.status===403);assert.equal(sqlite.prepare('SELECT count(*) n FROM workspaces').get().n,1);assert.equal(sqlite.prepare('SELECT count(*) n FROM workspace_starts').get().n,0);
 }finally{sqlite.close();}});

test('revoked starter cannot recreate membership; immutable receipt retains original ownership',async()=>{const sqlite=openStock(),db=d1Harness(sqlite);try{
 await startWorkspace(db,native,'inventory-test',input);sqlite.prepare('DELETE FROM members').run();await assert.rejects(startWorkspace(db,native,'inventory-test',input),e=>e.status===403);assert.equal(sqlite.prepare('SELECT count(*) n FROM members').get().n,0);assert.equal(sqlite.prepare('SELECT count(*) n FROM workspaces').get().n,1);assert.throws(()=>sqlite.exec('DELETE FROM workspace_starts'),/immutable/);assert.throws(()=>sqlite.exec("UPDATE workspace_starts SET user_id='other'"),/immutable/);
 }finally{sqlite.close();}});

test('workspace HTTP boundary enforces trusted identity, explicit body and origin before creating any access',async()=>{const sqlite=openStock(),db=d1Harness(sqlite),origin='https://inventory.test';try{
 const send=(body,identity=native,from=origin)=>inventoryHttp(new Request(origin+'/api/workspaces',{method:'POST',headers:{Origin:from,'Content-Type':'application/json'},body:JSON.stringify(body)}),{DB:db,APP_ORIGIN:origin,SITE_ID:'inventory-test',getIdentity:async()=>identity});
 assert.equal((await send(input,null)).status,401);assert.equal((await send(input,native,'https://other.test')).status,403);assert.equal((await send({...input,userId:'forged'})).status,400);assert.equal((await send({...input,email:'same@transport.test'})).status,400);assert.equal((await send({...input,role:'owner'})).status,400);assert.equal(sqlite.prepare('SELECT count(*) n FROM workspaces').get().n,0);
 const response=await send(input);assert.equal(response.status,201);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal((await send(input)).status,200);const opts={DB:db,APP_ORIGIN:origin,SITE_ID:'inventory-test',getIdentity:async()=>native},session=await inventoryHttp(new Request(origin+'/api/session'),opts);assert.equal(session.status,200);assert.equal((await session.json()).role,'owner');
 const command=(path,value)=>inventoryHttp(new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(value)}),opts);
 const itemResponse=await command('/api/items',{sku:'BOOT',name:'Synthetic onboarding goods',unit:'each'});assert.equal(itemResponse.status,201);const item=await itemResponse.json(),warehouseResponse=await command('/api/warehouses',{code:'MAIN',name:'Synthetic first warehouse'});assert.equal(warehouseResponse.status,201);const warehouse=await warehouseResponse.json();assert.equal((await command('/api/movements',{kind:'receive',itemId:item.id,warehouseId:warehouse.id,quantity:'3',reason:'Synthetic onboarding receipt',requestId:'onboarding-receipt'})).status,201);const stock=await inventoryHttp(new Request(origin+'/api/stock'),opts);assert.equal((await stock.json()).balances[0].quantity,3000000);
 }finally{sqlite.close();}});

test('failed owner insert rolls back workspace and start receipt together',async()=>{const sqlite=openStock(),db=d1Harness(sqlite);try{
 sqlite.exec("CREATE TRIGGER synthetic_fail_member BEFORE INSERT ON members BEGIN SELECT RAISE(ABORT,'Synthetic member write failed'); END;");await assert.rejects(startWorkspace(db,native,'inventory-test',input),/Synthetic member write failed/);assert.equal(sqlite.prepare('SELECT count(*) n FROM workspaces').get().n,0);assert.equal(sqlite.prepare('SELECT count(*) n FROM workspace_starts').get().n,0);
 }finally{sqlite.close();}});

for(const conflict of [false,true])test(`independent concurrent workspace starts ${conflict?'reject a different intent':'replay the same intent'} without orphan records`,async()=>{
 const root=resolve(mkdtempSync(join(tmpdir(),'firmsaarthi-workspace-test-'))),path=join(root,'synthetic.db'),sqlite=openStock(path),workers=[];
 try{
  const inputs=[input,conflict?{...input,name:'Conflicting synthetic name',requestId:'conflicting-create'}:input];for(const body of inputs)workers.push(new Worker(new URL('./workspace-start-worker.mjs',import.meta.url),{workerData:{path,input:body}}));
  const results=await Promise.all(workers.map(worker=>new Promise((resolve,reject)=>{worker.on('message',message=>{if(message.ready){worker.prepared=true;if(workers.every(w=>w.prepared))for(const w of workers)w.postMessage('commit');}else resolve(message);});worker.once('error',reject);worker.once('exit',code=>{if(code!==0)reject(Error('Workspace worker failed'));});})));
  assert.equal(results.filter(r=>r.success).length,conflict?1:2);if(conflict)assert.equal(results.find(r=>!r.success).status,409);else{assert.equal(results[0].workspace,results[1].workspace);assert.equal(results.filter(r=>r.replayed).length,1);}for(const table of ['workspaces','members','workspace_starts'])assert.equal(sqlite.prepare('SELECT count(*) n FROM '+table).get().n,1);
 }finally{await Promise.all(workers.map(w=>w.terminate()));sqlite.close();if(!root.startsWith(resolve(tmpdir())+sep)||!root.includes('firmsaarthi-workspace-test-'))throw Error('Unsafe synthetic cleanup');rmSync(root,{recursive:true,force:true});}
});
