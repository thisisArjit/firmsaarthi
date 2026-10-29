import assert from 'node:assert/strict';
const base=process.env.TMS_SMOKE_URL||'http://127.0.0.1:5174';assert.equal(new URL(base).hostname,'127.0.0.1');let cookie='';
async function request(path,body,session=cookie){return fetch(base+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json',origin:base}:{}),...(session?{cookie:session}:{})},body:body?JSON.stringify(body):undefined});}
async function ok(path,body){const r=await request(path,body);assert.equal(r.status,200,await r.clone().text());return r.json();}
const command=(action,data)=>ok('/api/tms',{action,data});
const login=await request('/api/auth',{action:'login',email:'auth-smoke@tms.test',password:'Synthetic test password 123!'},'');assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];
const supplier=await command('account.save',{kind:'supplier',code:'CN-HTTP',name:'Synthetic identity carrier'});
for(const cn of ['Cn-HTTP-001','Cn-HTTP-002','Cn-HTTP-003'])await command('consignment.save',{year:'2025-2026',cn,date:'2026-03-01',company:'Synthetic identity customer',truck:'TEST12345',origin:'Patna',destination:'Raipur',freight:100,advance:0});
const data=await ok('/api/tms?year=2025-2026'),trips=[];
for(const booking of data.consignments.slice(0,2)){const input={year:'2026-2027',consignmentId:booking.id,registration:booking.truck,supplierId:supplier.id,requestId:'http-identity-'+booking.cn},trip=await command('trip.create',input);trips.push(trip.id);assert.equal((await command('trip.create',input)).alreadyRecorded,true);const detail=await ok('/api/tms?view=trip&id='+trip.id);assert.equal(detail.trip.number,booking.cn);assert.equal(detail.trip.year,booking.year);assert.equal(detail.items.length,1);await command('trip.event',{tripId:trip.id,version:1,kind:'dispatch',eventAt:'2026-03-02T10:00:00+05:30',requestId:'http-identity-dispatch-'+booking.cn});}
const state=await ok('/api/tms?view=trips');assert.equal(state.trips.filter(t=>trips.includes(t.id)&&t.status==='dispatched').length,2);assert.ok(state.trips.filter(t=>trips.includes(t.id)).every(t=>t.consignment_numbers===t.number));
console.log('Consignment-trip HTTP checks passed: exact identifier, booking year, single allocation, retries and parallel same-truck consignment timelines. Synthetic local fixtures retained for browser QA.');
