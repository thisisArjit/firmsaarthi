import assert from 'node:assert/strict';
const base=process.env.TMS_SMOKE_URL||'http://127.0.0.1:5174';assert.equal(new URL(base).hostname,'127.0.0.1','Synthetic fixture checks are local-only.');
let cookie='';
async function request(path,body,session=cookie){return fetch(base+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json',Origin:base}:{}),...(session?{Cookie:session}:{})},body:body?JSON.stringify(body):undefined});}
async function command(action,data){const r=await request('/api/tms',{action,data});assert.equal(r.status,200,await r.clone().text());return r.json();}
assert.equal((await request('/api/tms?view=business',null,'')).status,401);
const login=await request('/api/auth',{action:'login',email:'auth-smoke@tms.test',password:'Synthetic test password 123!'},'');assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];
const vehicle=await command('vehicle.save',{registration:'BR-01-SH-1234'});
await command('consignment.save',{year:'2026-2027',cn:'SHARED-HTTP-1',date:'2026-10-25',company:'Synthetic industrial prospect',truck:'BR01SH1234',origin:'Patna',destination:'Ranchi',freight:100,advance:0,rate:100,weight:1,method:'Billed'});
let state=await (await request('/api/tms?year=2026-2027')).json();assert.ok(state.shared.vehicles.some(v=>v.id===vehicle.id));
for(const view of ['vehicles','gps','trips']){const r=await request('/api/tms?view='+view);assert.equal(r.status,200);assert.ok((await r.json()).vehicles.some(v=>v.id===vehicle.id),view);}
const lead=await command('business.lead.save',{name:'Synthetic industrial prospect',city:'Patna',area:'Synthetic test area',industry:'Industrial goods',sourceUrl:'https://example.com/company',notes:'Local test only',status:'research'});
assert.equal((await command('business.lead.save',{name:'Synthetic industrial prospect',city:'Patna'})).id,lead.id);
const customer=await command('business.lead.customer',{id:lead.id,version:1});state=await (await request('/api/tms?year=2026-2027')).json();assert.ok(state.companies.some(c=>c.id===customer.id));assert.ok(state.shared.customers.some(c=>c.name==='Synthetic industrial prospect'));
const invoice=await command('invoice.create',{year:'2026-2027',date:'2026-10-25',ids:[state.consignments.find(c=>c.cn==='SHARED-HTTP-1').id],taxMode:'none'});state=await (await request('/api/tms?year=2026-2027')).json();const snapshot=JSON.stringify(state.invoices.find(i=>i.id===invoice.id).snapshot);
await command('company.save',{name:'Synthetic industrial prospect',address:'Updated test address',gst:'SYNTHETIC'});state=await (await request('/api/tms?year=2026-2027')).json();assert.equal(JSON.stringify(state.invoices.find(i=>i.id===invoice.id).snapshot),snapshot);
console.log('Local HTTP shared registry, customer conversion, access and invoice-history checks passed.');
