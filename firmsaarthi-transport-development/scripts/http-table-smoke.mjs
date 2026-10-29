import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const base=process.env.TMS_SMOKE_URL||'http://127.0.0.1:5174';assert.equal(new URL(base).hostname,'127.0.0.1');let cookie='';
async function request(path,body){return fetch(base+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json',origin:base}:{}),...(cookie?{cookie}:{})},body:body?JSON.stringify(body):undefined});}
async function ok(path,body){const r=await request(path,body);assert.equal(r.status,200,await r.clone().text());return r.json();}const command=(action,data)=>ok('/api/tms',{action,data});
const login=await request('/api/auth',{action:'login',email:'auth-smoke@tms.test',password:'Synthetic test password 123!'});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];
for(const [cn,date,freight]of[['TABLE-CN-2','2026-10-24',900],['TABLE-CN-10','2026-10-25',10000.5],['TABLE-CN-1','2026-10-26',50]])await command('consignment.save',{year:'2026-2027',cn,date,company:'Synthetic table customer',truck:'TESTTABLE1',origin:'Patna',destination:'Raipur',freight,advance:0});
const state=await ok('/api/tms?year=2026-2027'),booking=state.consignments.find(c=>c.cn==='TABLE-CN-2'),invoice=await command('invoice.create',{year:'2026-2027',date:'2026-10-24',ids:[booking.id],taxMode:'none'});assert.match(invoice.id,/^[A-Za-z0-9_-]+$/);
// Reproduce the imported paid-flag presentation with named synthetic LOCAL data only.
const sql=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--json','--command',`UPDATE invoices SET paid=1 WHERE id='${invoice.id}' AND org_id='auth-smoke-org'`],{encoding:'utf8'});assert.equal(sql.status,0,sql.stderr);
const history=await ok('/api/tms?view=receipts&id='+invoice.id);assert.equal(history.receipts[0].method,'legacy');assert.equal(history.receipts[0].reference,'Imported paid flag; payment date not recorded');assert.equal(history.receipts[0].date,null);
console.log('Local table QA fixtures ready: three different amounts/dates/natural IDs and an unchanged imported payment source with unknown date. Run named cleanup after browser QA.');
