import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openStock,provision} from '../lib/stock.mjs';
import {d1Harness} from './d1-harness.mjs';
import {inventoryHttp} from '../lib/http.mjs';
import {inventoryMember} from '../lib/identity.mjs';
const origin='https://inventory.test',siteId='inventory-unit-site';
function fixture(){
 const sqlite=openStock();provision(sqlite,{orgId:'a',userId:'owner',name:'Synthetic A'});provision(sqlite,{orgId:'b',userId:'other',name:'Synthetic B'});sqlite.exec("INSERT INTO members VALUES('a','operator','operator'),('a','viewer','viewer')");const db=d1Harness(sqlite);
 const opts=actor=>({DB:db,APP_ORIGIN:origin,SITE_ID:siteId,getIdentity:async()=>actor==='anonymous'?null:{siteId,userId:actor}});
 const call=async(path,{actor='owner',body,method=body?'POST':'GET',headers={},raw}={})=>inventoryHttp(new Request(origin+path,{method,headers:{...(method==='POST'?{origin,'content-type':'application/json'}:{}),...headers},...(method==='POST'?{body:raw??JSON.stringify(body??{})}:{})}),opts(actor));
 return {sqlite,db,call,opts};
}
test('native identity needs active explicit membership, rejects other Sites/email and ambiguous workspaces',async()=>{const f=fixture();try{
 for(const identity of [{siteId:'transport-site',userId:'owner'},{siteId,email:'owner'},{siteId,userId:'new-user'}])assert.equal(await inventoryMember(f.db,identity,siteId),null);
 assert.equal((await inventoryMember(f.db,{siteId,userId:'owner'},siteId)).orgId,'a');f.sqlite.exec("UPDATE members SET role='disabled' WHERE user_id='owner'");assert.equal(await inventoryMember(f.db,{siteId,userId:'owner'},siteId),null);
 f.sqlite.exec("INSERT INTO members VALUES('b','operator','viewer')");assert.equal(await inventoryMember(f.db,{siteId,userId:'operator'},siteId),null);
 }finally{f.sqlite.close();}});
test('HTTP receive/issue/history and duplicate replay retain quantity and tenant scope',async()=>{const f=fixture();try{
 assert.equal((await f.call('/api/stock',{actor:'anonymous'})).status,401);assert.equal((await f.call('/api/stock',{actor:'new-user'})).status,403);
 const a=await f.call('/api/items',{body:{sku:'A',name:'Goods',unit:'each'}}),w=await f.call('/api/warehouses',{body:{code:'MAIN',name:'Main'}});assert.equal(a.status,201);assert.equal(w.status,201);const item=await a.json(),warehouse=await w.json();
 const input={kind:'receive',itemId:item.id,warehouseId:warehouse.id,quantity:'10',reason:'Synthetic receipt',requestId:'receipt-001'};
 const first=await f.call('/api/movements',{actor:'operator',body:input}),again=await f.call('/api/movements',{actor:'operator',body:input});assert.equal(first.status,201);assert.equal(again.status,200);assert.equal((await first.json()).id,(await again.json()).id);
 assert.equal((await f.call('/api/movements',{actor:'operator',body:{...input,quantity:'11'}})).status,409);assert.equal((await f.call('/api/movements',{actor:'other',body:{...input,requestId:'cross-org-001'}})).status,400);assert.equal((await(await f.call('/api/stock',{actor:'other'})).json()).items.length,0);
 assert.equal((await f.call('/api/movements',{actor:'operator',body:{...input,kind:'issue',quantity:'3',requestId:'issue-001'}})).status,201);
 const history=await(await f.call(`/api/history?item=${item.id}&warehouse=${warehouse.id}`)).json();assert.equal(history.records.reduce((n,r)=>n+r.delta,0),7000000);
 assert.equal((await f.call('/api/movements',{actor:'operator',body:{...input,kind:'issue',quantity:'8',requestId:'issue-002'}})).status,409);
 const adjustment={...input,kind:'adjust_out',quantity:'2',requestId:'adjust-001',expectedVersion:2};assert.equal((await f.call('/api/movements',{actor:'operator',body:adjustment})).status,403);assert.equal((await f.call('/api/movements',{body:{...adjustment,expectedVersion:1}})).status,409);
 const adjusted=await f.call('/api/movements',{body:adjustment});assert.equal(adjusted.status,201);const reversed=await f.call('/api/movements',{body:{kind:'reverse',reverses:(await adjusted.json()).id,reason:'Synthetic correction',requestId:'reverse-001'}});assert.equal(reversed.status,201);assert.equal((await(await f.call('/api/stock')).json()).balances[0].quantity,7000000);
 }finally{f.sqlite.close();}});
test('HTTP roles, CSRF, oversized/invalid body and forged identity cannot write',async()=>{const f=fixture();try{
 const body={sku:'A',name:'Goods',unit:'each'},changes=f.sqlite.prepare('SELECT total_changes() n').get().n;
 for(const actor of ['viewer','operator'])assert.equal((await f.call('/api/items',{actor,body})).status,403);
 for(const forged of [{orgId:'b'},{userId:'other'},{actor:'other'},{role:'owner'},{email:'firmsaarthi@gmail.com'}])assert.equal((await f.call('/api/items',{body:{...body,...forged}})).status,400);
 for(const value of ['','https://other.test'])assert.equal((await f.call('/api/items',{body,headers:{origin:value}})).status,403);
 assert.equal((await f.call('/api/stock',{headers:{'sec-fetch-site':'cross-site'}})).status,403);
 assert.equal((await f.call('/api/items',{body,headers:{'content-type':'text/plain'}})).status,415);assert.equal((await f.call('/api/items',{method:'POST',raw:'{broken'})).status,400);assert.equal((await f.call('/api/items',{body:[]})).status,400);assert.equal((await f.call('/api/items',{body:{...body,name:'x'.repeat(17000)}})).status,413);
 assert.equal((await f.call('/api/items',{actor:'anonymous',body,headers:{'oai-authenticated-user-id':'owner',cookie:'logistrace_session=anything'}})).status,401);assert.equal(f.sqlite.prepare('SELECT total_changes() n').get().n,changes);assert.equal((await f.call('/api/session/create',{body:{}})).status,404);
 }finally{f.sqlite.close();}});
test('HTTP private responses are uncached; missing trusted adapter and wrong host are rejected',async()=>{const f=fixture();try{
 const response=await f.call('/api/stock');assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('access-control-allow-origin'),null);
 assert.equal((await inventoryHttp(new Request('https://transport.test/api/stock'),f.opts('owner'))).status,403);assert.equal((await inventoryHttp(new Request(origin+'/api/stock'),{...f.opts('owner'),getIdentity:undefined})).status,503);
 }finally{f.sqlite.close();}});
