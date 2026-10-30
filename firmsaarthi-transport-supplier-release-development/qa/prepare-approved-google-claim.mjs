import assert from 'node:assert/strict';
import {createInterface} from 'node:readline';
if(process.stdin.isTTY)process.stdin.setRawMode(true);console.log('Ready for approved isolated Google-claim fixture configuration.');
const r=createInterface({input:process.stdin,terminal:false}),queue=[],waiters=[];r.on('line',s=>{const v=JSON.parse(s),n=waiters.shift();if(n)n(v);else queue.push(v);});const read=()=>queue.length?Promise.resolve(queue.shift()):new Promise(resolve=>waiters.push(resolve));
const input=await read(),origin='https://firmsaarthi-transport-staging.arjit-tiwari-ece14.chatgpt.site';assert.equal(input.origin,origin);assert.equal(input.approvedEmail,'firmsaarthi@gmail.com');assert.equal(input.approved,true);
async function request(path,data,cookie=''){return fetch(origin+path,{method:data?'POST':'GET',headers:{'OAI-Sites-Authorization':'Bearer '+input.token,Origin:origin,'Content-Type':'application/json',Cookie:cookie},...(data?{body:JSON.stringify(data)}:{})});}
function cookie(response){return response.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');}
let adminCookie='',oldCookie='';try{
 const release=await(await request('/api/release')).json();assert.equal(release.environment,'staging');assert.equal(release.fingerprint,'99d0453b3e9f148cd3e377cafe2ff7865dc4d0451247c647d31db5d4904f2896');
 const login=await request('/api/auth',{action:'login',email:`supplier-release-admin-${input.fixtureSuffix}@staging.test`,password:input.password});assert.equal(login.status,200);adminCookie=cookie(login);
 const result=await request('/api/tms',{action:'team.create',data:{email:input.approvedEmail,password:input.password,role:'MEMBER'}},adminCookie);
 if(result.status===200){
  const prior=await request('/api/auth',{action:'login',email:input.approvedEmail,password:input.password});assert.equal(prior.status,200);oldCookie=cookie(prior);const identity=await(await request('/api/auth',undefined,oldCookie)).json();assert.equal(identity.email,input.approvedEmail);assert.equal(identity.googleLinked,false);
  console.log('Approved synthetic staging MEMBER created in empty test workspace; old sign-in verified. No production or provider credentials changed.');
 }else{const body=await result.json();assert.equal(result.status,400);assert.equal(body.error,'An account with this email already exists.');console.log('An existing staging account was preserved; no credentials, roles or membership were changed.');}
 await request('/api/auth',{action:'logout'},adminCookie);adminCookie='';console.log('Fixture preparation complete. Waiting for explicit user-completed Google/mail/fresh-password review.');
 const command=await read();if(command.action==='verify-after'&&oldCookie){const state=await(await request('/api/auth',undefined,oldCookie)).json();assert.equal(state.email,null);const old=await request('/api/auth',{action:'login',email:input.approvedEmail,password:input.password});assert.equal(old.status,401);console.log('Actual earlier staging session and old staging password are denied after the explicit claim.');}
}catch(e){console.error('Isolated fixture step failed: '+String(e.message).replaceAll(input.token,'[redacted]').replaceAll(input.password,'[redacted]'));process.exitCode=1;}finally{if(adminCookie)await request('/api/auth',{action:'logout'},adminCookie).catch(()=>{});r.close();}
