import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const base=process.env.TMS_SMOKE_URL||'http://127.0.0.1:5174';
assert.equal(new URL(base).hostname,'127.0.0.1','Synthetic mutation QA is local only.');
let cookie='';
async function req(path,body,session=cookie,origin=base){return fetch(base+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json',origin}:{}),...(session?{cookie:session}:{})},body:body?JSON.stringify(body):undefined});}
async function ok(path,body){const r=await req(path,body);assert.equal(r.status,200,await r.clone().text());return r.json();}
assert.equal((await req('/api/invoice-template',null,'')).status,401);
const login=await req('/api/auth',{action:'login',email:'auth-smoke@tms.test',password:'Synthetic test password 123!'},'');assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];
let state=await ok('/api/invoice-template');assert.equal(state.custom,false);
const before=await ok('/api/tms?year=2026-2027');
const config={...state.config,title:'SYNTHETIC FREIGHT INVOICE',orientation:'landscape',notes:'Synthetic local terms only.'};
assert.equal((await req('/api/invoice-template',{action:'save',config,version:state.version},cookie,'https://evil.example')).status,403);
assert.equal((await req('/api/invoice-template',{action:'save',config:{...config,html:'<script>'},version:state.version})).status,400);
assert.equal((await req('/api/invoice-template',{action:'save',config:{...config,notes:'a'.repeat(17000)},version:state.version})).status,413);
for(const c of [null,config]){const preview=await req('/api/invoice-template',{action:'preview',config:c});assert.equal(preview.status,200,await preview.clone().text());assert.match(preview.headers.get('content-type'),/application\/pdf/);assert.equal(preview.headers.get('cache-control'),'no-store');assert.ok((await preview.text()).startsWith('%PDF-'));}
assert.equal((await ok('/api/tms?year=2026-2027')).invoices.length,before.invoices.length,'Preview must not issue invoices.');
state=await ok('/api/invoice-template',{action:'save',config,version:state.version});assert.equal(state.custom,true);
assert.equal((await req('/api/invoice-template',{action:'save',config,version:state.version-1})).status,409);
writeFileSync('outputs/qa-invoice-template.json',JSON.stringify(config,null,2));
const lead=await ok('/api/tms',{action:'business.lead.save',data:{name:'Synthetic contact QA',city:'Raipur',phone:'+910000000000',email:'synthetic@example.test',contactSourceUrl:'https://example.test/contact',contactCheckedOn:'2026-10-26'}});
const leads=await ok('/api/tms?view=business');assert.equal(leads.leads.find(l=>l.id===lead.id).email,'synthetic@example.test');
const saved=leads.leads.find(l=>l.id===lead.id);await ok('/api/tms',{action:'business.lead.save',data:{id:saved.id,version:saved.version,name:saved.name,city:saved.city,notes:'Older client update'}});assert.equal((await ok('/api/tms?view=business')).leads.find(l=>l.id===lead.id).phone,'+910000000000');
await ok('/api/tms',{action:'consignment.save',data:{year:'2026-2027',cn:'TEMPLATE-QA-CN',date:'2026-10-26',company:'Synthetic invoice customer',truck:'TEST-TEMPLATE',origin:'Patna',destination:'Raipur',freight:100,advance:0}});
await ok('/api/invoice-template',{action:'reset',version:state.version});
console.log('Template HTTP checks passed: auth, CSRF, bounds, invalid format, preview without issuance, version conflicts, reset, contacts and older-client retention. Synthetic fixtures retained for browser QA; run http-auth-smoke cleanup afterwards.');
