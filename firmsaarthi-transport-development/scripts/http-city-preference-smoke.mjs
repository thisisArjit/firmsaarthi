import assert from 'node:assert/strict';
const base=process.env.TMS_SMOKE_URL||'http://127.0.0.1:5174';assert.equal(new URL(base).hostname,'127.0.0.1');let cookie='';
async function request(path,body,session=cookie,origin=base){return fetch(base+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json',origin}:{}),...(session?{cookie:session}:{})},body:body?JSON.stringify(body):undefined});}
async function ok(path,body){const r=await request(path,body);assert.equal(r.status,200,await r.clone().text());return r.json();}const command=data=>ok('/api/tms',{action:'profile.save',data}),state=()=>ok('/api/tms?year=2026-2027');
const login=await request('/api/auth',{action:'login',email:'auth-smoke@tms.test',password:'Synthetic test password 123!'},'');assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];
const profile={transportName:'Synthetic city preference business',interestedCity:'Patna'};await command(profile);assert.equal((await state()).business.profile.interestedCity,'Patna');
assert.equal((await request('/api/tms',{action:'profile.save',data:{...profile,interestedCity:'Typed city'}})).status,400);assert.equal((await state()).business.profile.interestedCity,'Patna');
await command({transportName:profile.transportName});assert.equal((await state()).business.profile.interestedCity,'Patna');await command({...profile,interestedCity:''});assert.equal((await state()).business.profile.interestedCity,'');await command(profile);
assert.equal((await request('/api/tms',{action:'profile.save',data:profile},'')).status,401);assert.equal((await request('/api/tms',{action:'profile.save',data:profile},cookie,'https://evil.invalid')).status,403);
console.log('Local city preference HTTP checks passed: optional selection/clear, invalid input rejection, older-client preservation, anonymous/CSRF denial. Synthetic profile retained for browser QA.');
