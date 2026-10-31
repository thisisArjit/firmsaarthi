import assert from 'node:assert/strict';
const base=process.env.TMS_SMOKE_URL||'http://127.0.0.1:5174';assert.equal(new URL(base).hostname,'127.0.0.1');let cookie='';
async function request(path,body,session=cookie,origin=base){return fetch(base+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json',origin}:{}),...(session?{cookie:session}:{})},body:body?JSON.stringify(body):undefined});}
async function ok(path,body){const r=await request(path,body);assert.equal(r.status,200,await r.clone().text());return r.json();}
const command=(action,data)=>ok('/api/tms',{action,data});
assert.equal((await request('/api/tms?view=companies',null,'')).status,401);
const login=await request('/api/auth',{action:'login',email:'auth-smoke@tms.test',password:'Synthetic test password 123!'},'');assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];
await command('company.save',{name:'Synthetic Industrial Company',address:'Synthetic Patna address',gst:'SAMPLE-GST'});await command('company.save',{name:'Synthetic Empty Company'});
for(const [year,date,cn]of[['2025-2026','2026-03-01','COMPANY-OLD'],['2026-2027','2026-10-26','COMPANY-NEW']])await command('consignment.save',{year,date,cn,company:'Synthetic Industrial Company',truck:'TEST-COMPANY',origin:'Patna',destination:'Raipur',freight:100,advance:0});
const path='/api/tms?view=companies&name='+encodeURIComponent('Synthetic Industrial Company');let detail=await ok(path);assert.equal(detail.consignments.length,2);const old=detail.consignments.find(c=>c.cn==='COMPANY-OLD');
const invoice=await command('invoice.create',{year:old.year,date:old.date,ids:[old.id],taxMode:'none'});await command('receipt.create',{invoiceId:invoice.id,date:'2026-10-26',amount:30,method:'bank',reference:'SYNTHETIC-COMPANY-RECEIPT',requestId:'company-http-receipt'});
const account=await command('account.save',{kind:'customer',code:'COMPANY-QA',name:'Synthetic company account'});await command('account.alias.link',{partyId:account.id,alias:'Synthetic Industrial Company'});
const before=await ok('/api/tms?year=2025-2026');await command('company.save',{name:'Synthetic Industrial Company',address:'Updated synthetic address',gst:'SAMPLE-GST'});assert.equal(JSON.stringify((await ok('/api/tms?year=2025-2026')).invoices[0].snapshot),JSON.stringify(before.invoices[0].snapshot));
detail=await ok(path);assert.equal(detail.invoices.length,1);assert.equal(detail.company.bookings,2);assert.equal(detail.company.address,'Updated synthetic address');assert.equal((await request('/api/tms?view=companies&name=Not-in-this-workspace')).status,404);
const statement=await ok('/api/tms?view=account-statement&kind=customer&key='+encodeURIComponent('party:'+account.id));assert.equal(statement.group.remaining,7000);assert.equal(statement.payments.length,1);
console.log('Company HTTP QA passed: all years, profile update preserves invoices, scoped statement/payment totals, missing company and anonymous access. Synthetic fixtures retained only for local browser QA.');
