import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openStock,provision} from '../lib/stock.mjs';
import {d1Harness} from './d1-harness.mjs';
import {inventoryHttp} from '../lib/http.mjs';
import {StockClient,formatQuantity} from '../public/stock-client.mjs';
function fixture(){
 const sqlite=openStock();provision(sqlite,{orgId:'a',userId:'owner',name:'Synthetic A'});provision(sqlite,{orgId:'b',userId:'other',name:'Synthetic B'});sqlite.exec("INSERT INTO members VALUES('a','viewer','viewer'),('a','operator','operator')");
 let actor='owner',lose=false,switchOnWrite=false;const bodies=[],opts={DB:d1Harness(sqlite),APP_ORIGIN:'https://inventory.test',SITE_ID:'inventory-test',getIdentity:async()=>({userId:actor,siteId:'inventory-test'})};
 const fetcher=async(path,init={})=>{if(init.body)bodies.push(JSON.parse(init.body));if(switchOnWrite&&init.method==='POST'){actor='other';switchOnWrite=false;}const response=await inventoryHttp(new Request(opts.APP_ORIGIN+path,{...init,headers:{...init.headers,...(init.method==='POST'?{Origin:opts.APP_ORIGIN}:{})}}),opts);if(lose&&path==='/api/movements'){lose=false;throw Error('Synthetic response lost after commit');}return response;};
 const client=new StockClient(fetcher);return {sqlite,client,bodies,setActor:value=>actor=value,loseResponse:()=>lose=true,switchBeforeWrite:()=>switchOnWrite=true};
}
async function masters(f){await f.client.request('/api/items',{sku:'A',name:'Synthetic goods',unit:'kg'});await f.client.request('/api/warehouses',{code:'MAIN',name:'Synthetic warehouse'});await f.client.load();return {itemId:f.client.state.items[0].id,warehouseId:f.client.state.warehouses[0].id};}
function recoveryStorage(){const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}

test('reload recovers a lost successful result with the original request and one ledger row',async()=>{const f=fixture(),storage=recoveryStorage();try{
 const pair=await masters(f),client=new StockClient(f.client.fetcher,{storage});await client.load();const intent=client.review({...pair,kind:'receive',quantity:'2.5',reason:'Synthetic reload recovery'});f.loseResponse();await assert.rejects(client.confirm(),/Connection interrupted/);
 const reloaded=new StockClient(f.client.fetcher,{storage});await reloaded.load();assert.deepEqual(reloaded.pending,intent);assert.equal(reloaded.ambiguous,true);assert.throws(()=>reloaded.cancel(),/pending request/);assert.equal((await reloaded.confirm()).replayed,true);assert.equal(storage.getItem('firmsaarthi.inventory.intent.v1'),null);await reloaded.load();assert.equal(reloaded.state.balances[0].quantity,2500000);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM movements').get().n,1);
 }finally{f.sqlite.close();}});

test('reload does not expose another account intent; same actor recovery retains the reviewed count version',async()=>{const f=fixture(),storage=recoveryStorage();try{
 const pair=await masters(f),client=new StockClient(f.client.fetcher,{storage});await client.load();client.review({...pair,kind:'adjust_in',quantity:'1',reason:'Synthetic original count'});f.loseResponse();await assert.rejects(client.confirm(),/Connection interrupted/);
 const reloaded=new StockClient(f.client.fetcher,{storage});await reloaded.load();assert.equal(reloaded.pending.expectedVersion,0);assert.equal(reloaded.state.balances[0].version,1);assert.equal((await reloaded.confirm()).replayed,true);
 reloaded.review({...pair,kind:'receive',quantity:'1',reason:'Synthetic different account'});f.loseResponse();await assert.rejects(reloaded.confirm(),/Connection interrupted/);f.setActor('other');const other=new StockClient(f.client.fetcher,{storage});await other.load();assert.equal(other.pending,null);assert.equal(storage.getItem('firmsaarthi.inventory.intent.v1'),null);assert.equal(other.state.items.length,0);
 }finally{f.sqlite.close();}});

test('unavailable recovery storage prevents a fresh write and never unlocks an uncertain recovered intent',async()=>{const f=fixture(),storage=recoveryStorage();try{
 const pair=await masters(f),client=new StockClient(f.client.fetcher,{storage});await client.load();client.review({...pair,kind:'receive',quantity:'1',reason:'Synthetic storage failure'});const save=storage.setItem;storage.setItem=()=>{throw Error('Synthetic storage denied');};await assert.rejects(client.confirm(),/Nothing was submitted/);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM movements').get().n,0);
 storage.setItem=save;f.loseResponse();await assert.rejects(client.confirm(),/Connection interrupted/);const reloaded=new StockClient(f.client.fetcher,{storage});await reloaded.load();storage.setItem=()=>{throw Error('Synthetic storage denied');};await assert.rejects(reloaded.confirm(),/recovery is unavailable/);assert.equal(reloaded.ambiguous,true);assert.throws(()=>reloaded.cancel(),/pending request/);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM movements').get().n,1);
 }finally{f.sqlite.close();}});

test('corrupt same-account saved payload blocks further posting without submitting it',async()=>{const f=fixture(),storage=recoveryStorage();try{
 await masters(f);storage.setItem('firmsaarthi.inventory.intent.v1',JSON.stringify({version:1,context:f.client.identity,intent:{kind:'receive',requestId:'not-valid',reason:'Synthetic corruption'}}));const reloaded=new StockClient(f.client.fetcher,{storage});await assert.rejects(reloaded.load(),/recovery is invalid/);assert.equal(reloaded.pending,null);assert.equal(reloaded.state,null);await assert.rejects(reloaded.confirm(),/Review a movement/);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM movements').get().n,0);
 }finally{f.sqlite.close();}});

test('reload after a request never reached the server posts the recovered intent once',async()=>{const f=fixture(),storage=recoveryStorage();try{
 const pair=await masters(f);let offline=true;const fetcher=(path,init)=>{if(path==='/api/movements'&&offline)throw Error('Synthetic offline before submission');return f.client.fetcher(path,init);};const client=new StockClient(fetcher,{storage});await client.load();const original=client.review({...pair,kind:'receive',quantity:'3',reason:'Synthetic pre-submit disconnect'});await assert.rejects(client.confirm(),/Connection interrupted/);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM movements').get().n,0);offline=false;const reloaded=new StockClient(fetcher,{storage});await reloaded.load();assert.deepEqual(reloaded.pending,original);assert.equal(!!(await reloaded.confirm()).replayed,false);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM movements').get().n,1);
 }finally{f.sqlite.close();}});

test('failure clearing a completed intent retains same-ID recovery rather than allowing a second post',async()=>{const f=fixture(),storage=recoveryStorage();try{
 const pair=await masters(f),client=new StockClient(f.client.fetcher,{storage});await client.load();const original=client.review({...pair,kind:'receive',quantity:'1',reason:'Synthetic cleanup failure'}),remove=storage.removeItem;storage.removeItem=()=>{throw Error('Synthetic remove denied');};await assert.rejects(client.confirm(),/cleanup failed/);assert.equal(client.ambiguous,true);assert.equal(client.pending,original);assert.throws(()=>client.cancel(),/pending request/);storage.removeItem=remove;const reloaded=new StockClient(f.client.fetcher,{storage});await reloaded.load();assert.equal((await reloaded.confirm()).replayed,true);assert.equal(storage.getItem('firmsaarthi.inventory.intent.v1'),null);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM movements').get().n,1);
 }finally{f.sqlite.close();}});
test('reviewed client receive/issue/adjust/reverse reconciles exact stock through real HTTP handler',async()=>{const f=fixture();try{
 const pair=await masters(f);f.client.review({...pair,kind:'receive',quantity:'10.125',reason:'Synthetic receipt'});await f.client.confirm();await f.client.load();
 f.client.review({...pair,kind:'issue',quantity:'3.125',reason:'Synthetic issue'});await f.client.confirm();await f.client.load();assert.equal(formatQuantity(f.client.state.balances[0].quantity),'7');
 f.client.review({...pair,kind:'adjust_out',quantity:'1',reason:'Synthetic count'});const adjusted=await f.client.confirm();await f.client.load();f.client.review({kind:'reverse',reverses:adjusted.id,reason:'Synthetic correction'});await f.client.confirm();await f.client.load();assert.equal(formatQuantity(f.client.state.balances[0].quantity),'7');
 const history=await f.client.request('/api/history?item='+pair.itemId+'&warehouse='+pair.warehouseId);assert.equal(history.records.length,4);assert.equal(history.records.reduce((s,r)=>s+r.delta,0),7000000);
 }finally{f.sqlite.close();}});
test('lost successful response retains immutable intent and exact retry posts once',async()=>{const f=fixture();try{
 const pair=await masters(f);const pending=f.client.review({...pair,kind:'receive',quantity:'2.5',reason:'Synthetic uncertain receipt'});f.loseResponse();await assert.rejects(f.client.confirm(),/Connection interrupted/);assert.equal(f.client.pending,pending);assert.throws(()=>f.client.cancel(),/pending request/);assert.throws(()=>f.client.review({...pair,kind:'receive',quantity:'3',reason:'Another'}),/current review/);
 const result=await f.client.confirm();assert.equal(result.replayed,true);await f.client.load();assert.equal(f.client.state.balances[0].quantity,2500000);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM movements').get().n,1);const posted=f.bodies.filter(b=>b.kind);assert.deepEqual(posted[0],posted[1]);
 }finally{f.sqlite.close();}});
test('refresh preserves reviewed count version; stale confirmation requires deliberate new review',async()=>{const f=fixture();try{
 const pair=await masters(f);const pending=f.client.review({...pair,kind:'adjust_in',quantity:'1',reason:'Synthetic count'});await f.client.request('/api/movements',{...pair,kind:'receive',quantity:'2',reason:'Intervening receipt',requestId:'intervening-001'});await f.client.load();assert.equal(f.client.pending,pending);assert.equal(pending.expectedVersion,0);await assert.rejects(f.client.confirm(),/Stock changed/);assert.equal(f.client.ambiguous,false);f.client.cancel();f.client.review({...pair,kind:'adjust_in',quantity:'1',reason:'Reviewed latest count'});assert.equal(f.client.pending.expectedVersion,1);await f.client.confirm();
 }finally{f.sqlite.close();}});
test('account change clears pending draft and cannot post it into another workspace',async()=>{const f=fixture();try{
 const pair=await masters(f);f.client.review({...pair,kind:'receive',quantity:'2',reason:'Synthetic receipt'});f.setActor('other');await assert.rejects(f.client.confirm(),/workspace changed/);assert.equal(f.client.pending,null);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM movements').get().n,0);await assert.rejects(f.client.load(),/workspace changed/);
 }finally{f.sqlite.close();}});
test('viewer cannot review and simultaneous confirmation cannot create two submissions',async()=>{const f=fixture();try{
 const pair=await masters(f);f.setActor('viewer');const viewer=new StockClient(f.client.fetcher);await viewer.load();assert.throws(()=>viewer.review({...pair,kind:'receive',quantity:'1',reason:'Denied'}),/not permitted/);f.setActor('owner');f.client.review({...pair,kind:'receive',quantity:'1',reason:'Synthetic receipt'});const running=f.client.confirm();await assert.rejects(f.client.confirm(),/already running/);await running;assert.equal(f.sqlite.prepare('SELECT count(*) n FROM movements').get().n,1);
 assert.equal(formatQuantity(-1250000),'-1.25');assert.equal(formatQuantity(1000),'0.001');assert.throws(()=>formatQuantity(0.1),/Invalid/);
 }finally{f.sqlite.close();}});
test('identity precondition rejects an account changing after preflight, including new master creation',async()=>{const f=fixture();try{
 await masters(f);f.switchBeforeWrite();await assert.rejects(f.client.request('/api/items',{sku:'LEAK',name:'Wrong workspace draft',unit:'each'}),/workspace changed/);assert.equal(f.sqlite.prepare("SELECT count(*) n FROM items WHERE org_id='b'").get().n,0);
 const response=await inventoryHttp(new Request('https://inventory.test/api/items',{method:'POST',headers:{origin:'https://inventory.test','content-type':'application/json','x-inventory-context':'["a","owner"]'},body:JSON.stringify({sku:'CROSS',name:'Denied',unit:'each'})}),{DB:d1Harness(f.sqlite),APP_ORIGIN:'https://inventory.test',SITE_ID:'inventory-test',getIdentity:async()=>({userId:'other',siteId:'inventory-test'})});assert.equal(response.status,403);assert.equal(f.sqlite.prepare("SELECT count(*) n FROM items WHERE org_id='b'").get().n,0);
 }finally{f.sqlite.close();}});
