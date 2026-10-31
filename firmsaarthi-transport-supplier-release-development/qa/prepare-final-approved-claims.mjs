import assert from 'node:assert/strict';
import {createInterface} from 'node:readline';
import {randomBytes} from 'node:crypto';
if(process.stdin.isTTY)process.stdin.setRawMode(true);
console.log('Ready for hidden approved staging-test configuration.');
const rl=createInterface({input:process.stdin,terminal:false}),q=[],wait=[];
rl.on('line',s=>{const v=JSON.parse(s),w=wait.shift();w?w(v):q.push(v)});
const read=()=>q.length?Promise.resolve(q.shift()):new Promise(r=>wait.push(r));
const cfg=await read(),origin='https://firmsaarthi-transport-staging.arjit-tiwari-ece14.chatgpt.site';
assert.equal(cfg.origin,origin);assert.equal(cfg.approved,true);
const emails=['thisisarjit@gmail.com','arjit.tiwari.ece14@itbhu.ac.in'];
const accounts=new Map();let ownerCookie='';
async function req(path,data,cookie=''){return fetch(origin+path,{method:data?'POST':'GET',headers:{'OAI-Sites-Authorization':'Bearer '+cfg.token,Origin:origin,'Content-Type':'application/json',Cookie:cookie},redirect:'manual',...(data?{body:JSON.stringify(data)}:{})});}
const cookie=r=>r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
try{
 assert.equal((await(await req('/api/release')).json()).fingerprint,cfg.fingerprint);
 const login=await req('/api/auth',{action:'login',email:cfg.ownerEmail,password:cfg.ownerPassword});assert.equal(login.status,200);ownerCookie=cookie(login);
 for(const email of emails){
  const password=randomBytes(18).toString('base64url');
  const result=await req('/api/tms',{action:'team.create',data:{email,password,role:'MEMBER'}},ownerCookie);
  if(result.status===200){const old=await req('/api/auth',{action:'login',email,password});assert.equal(old.status,200);const oldCookie=cookie(old),identity=await(await req('/api/auth',undefined,oldCookie)).json();assert.equal(identity.email,email);assert.equal(identity.googleLinked,false);accounts.set(email,{password,oldCookie});console.log(JSON.stringify({email,outcome:'approved MEMBER created; initial staging login verified; credentials in memory only'}));}
  else{const body=await result.json();assert.equal(result.status,400);assert.equal(body.error,'An account with this email already exists.');console.log(JSON.stringify({email,outcome:'existing staging account preserved; no credential or role changes'}));}
 }
 await req('/api/auth',{action:'logout'},ownerCookie);ownerCookie='';console.log('Approved fixture preparation complete; waiting for user-completed password/consent.');
 while(true){const cmd=await read();if(cmd.action==='stop')break;assert.equal(cmd.action,'verify-after');assert.ok(emails.includes(cmd.email));const prior=accounts.get(cmd.email);if(!prior){console.log(JSON.stringify({email:cmd.email,oldCredentialProof:'unavailable for preserved existing account'}));continue;}const state=await(await req('/api/auth',undefined,prior.oldCookie)).json();assert.equal(state.email,null);assert.equal((await req('/api/auth',{action:'login',email:cmd.email,password:prior.password})).status,401);console.log(JSON.stringify({email:cmd.email,oldSessionDenied:true,oldPasswordDenied:true}));}
}catch{console.log('Approved staging fixture step failed; no credentials or raw errors logged.');process.exitCode=1;}finally{if(ownerCookie)await req('/api/auth',{action:'logout'},ownerCookie).catch(()=>{});rl.close();}
