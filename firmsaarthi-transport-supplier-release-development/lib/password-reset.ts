import {AppError} from './service';
import {normalizeEmail} from './auth';
import {digest,hashPassword,hex,randomToken,validatePassword} from './passwords';
import type {Row} from './domain';
export type ResetMail={to:string;code:string;requestId:string};
export type ResetSender=(mail:ResetMail)=>Promise<void>;
const unavailable=()=>new AppError('This code or reset session is invalid or expired. Request a new code.',400);
const invalid=()=>new AppError('The code is incorrect or expired. Check it or request a new code.',400);
const equal=(a:string,b:string)=>{let mismatch=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)mismatch|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return mismatch===0;};
const tokenValue=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export const resetCookieName=()=>process.env.NODE_ENV==='production'?'__Host-tms_reset':'tms_reset';
export function resetCookie(proof:string,age=600){return `${resetCookieName()}=${proof}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${process.env.NODE_ENV==='production'?'; Secure':''}`;}
export function resetProof(cookie:string|null){const v=(cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(resetCookieName()+'='))?.slice(resetCookieName().length+1);return tokenValue(v)?v:null;}
export class PasswordReset {
 constructor(private db:D1Database,private secret:string,private send:ResetSender,private clock=()=>Date.now(),private dailyBudget=70){}
 private now(){return Math.floor(this.clock()/1000);}
 private q(sql:string,...args:any[]){return this.db.prepare(sql).bind(...args);}
 private async mac(value:string){if(!/^[a-f0-9]{64}$/.test(this.secret))throw new AppError('Email password reset is temporarily unavailable.',503);const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(this.secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value))));}
 private async limit(purpose:string,subject:string,maximum:number,seconds:number){const bucket=Math.floor(this.now()/seconds),key=`reset:${purpose}:${await this.mac(subject)}:${bucket}`;const r=await this.q('INSERT INTO auth_limits(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts',key,(bucket+2)*seconds).run();if(Number((r.results?.[0] as Row)?.attempts)>maximum)throw new AppError('Too many reset attempts. Please try again later.',429);}
 async request(email:unknown,ip:string){
  const normalized=normalizeEmail(email),now=this.now(),subject=await this.mac('email:'+normalized);
  await this.limit('request-ip',ip,10,900);await this.limit('request-email',normalized,3,900);await this.limit('delivery-budget','all',this.dailyBudget,86400);
  if(await this.q('SELECT id FROM password_reset_requests WHERE subject_hash=? AND created_at>? LIMIT 1',subject,now-60).first())throw new AppError('Wait one minute before requesting another code.',429);
  const account=await this.q('SELECT a.user_id,a.email,a.credential_version,m.org_id,m.role FROM password_accounts a JOIN memberships m ON m.user_id=a.user_id WHERE a.email=? AND a.disabled=0',normalized).first<Row>();
  const requestId=randomToken(),proof=randomToken(),id=await digest(requestId),browserHash=await digest(proof);
  let n:number;do{n=crypto.getRandomValues(new Uint32Array(1))[0];}while(n>=4294000000);const code=String(n%1000000).padStart(6,'0');
  await this.db.batch([
   this.q("UPDATE password_reset_requests SET status='superseded',code_hash='',reset_hash=NULL WHERE subject_hash=? AND status IN ('pending','sent','verified')",subject),
   this.q("INSERT INTO password_reset_requests(id,subject_hash,user_id,org_id,role,account_email,credential_version,browser_hash,code_hash,status,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,'pending',?,?)",id,subject,account?.user_id||null,account?.org_id||null,account?.role||null,account?.email||null,account?.credential_version||null,browserHash,await this.mac(`code:${id}:${browserHash}:${code}`),now,now+600),
   this.q('DELETE FROM password_reset_requests WHERE expires_at<?',now-86400),this.q('DELETE FROM auth_limits WHERE expires_at<=?',now),
  ]);
  try{if(account)await this.send({to:normalized,code,requestId:id});await this.q("UPDATE password_reset_requests SET status='sent' WHERE id=? AND status='pending'",id).run();}
  catch{await this.q("UPDATE password_reset_requests SET status='failed',code_hash='' WHERE id=? AND status='pending'",id).run();}
  return {requestId,proof,message:'If an account exists for that email, a reset code will arrive shortly. It expires in 10 minutes.'};
 }
 async verify(requestId:unknown,code:unknown,proof:string|null,ip:string){
  await this.limit('verify-ip',ip,30,900);if(!tokenValue(requestId)||!tokenValue(proof)||typeof code!=='string'||!/^\d{6}$/.test(code))throw invalid();
  const id=await digest(requestId),browserHash=await digest(proof),now=this.now();
  const result=await this.q("UPDATE password_reset_requests SET attempts=attempts+1 WHERE id=? AND browser_hash=? AND status='sent' AND expires_at>? AND attempts<5 RETURNING *",id,browserHash,now).run();const row=result.results?.[0] as Row|undefined;
  if(!row||!row.user_id||!equal(await this.mac(`code:${id}:${browserHash}:${code}`),row.code_hash))throw invalid();
  const resetToken=randomToken(),claimed=await this.q("UPDATE password_reset_requests SET status='verified',code_hash='',reset_hash=?,expires_at=MIN(expires_at,?) WHERE id=? AND status='sent' AND attempts=? AND expires_at>?",await digest(resetToken),this.now()+300,id,row.attempts,this.now()).run();
  if(claimed.meta.changes!==1)throw invalid();return {resetToken};
 }
 async complete(requestId:unknown,resetToken:unknown,password:unknown,proof:string|null,ip:string){
  await this.limit('complete-ip',ip,20,900);if(!tokenValue(requestId)||!tokenValue(resetToken)||!tokenValue(proof))throw unavailable();
  try{validatePassword(password);}catch{throw new AppError('Use a password of 8 to 128 characters.');}
  const id=await digest(requestId),resetHash=await digest(resetToken),browserHash=await digest(proof);
  const row=await this.q("SELECT * FROM password_reset_requests WHERE id=? AND reset_hash=? AND browser_hash=? AND status='verified' AND expires_at>?",id,resetHash,browserHash,this.now()).first<Row>();if(!row)throw unavailable();
  const passwordHash=await hashPassword(password),version=crypto.randomUUID(),nonce=crypto.randomUUID(),now=this.now(),at=new Date(this.clock()).toISOString();
  const completed=await this.db.batch([
   this.q("UPDATE password_reset_requests SET status='consumed',completion_nonce=?,reset_hash=NULL WHERE id=? AND reset_hash=? AND browser_hash=? AND status='verified' AND expires_at>? AND EXISTS(SELECT 1 FROM password_accounts a JOIN memberships m ON m.user_id=a.user_id WHERE a.user_id=password_reset_requests.user_id AND a.email=password_reset_requests.account_email AND a.credential_version=password_reset_requests.credential_version AND a.disabled=0 AND m.org_id=password_reset_requests.org_id AND m.role=password_reset_requests.role)",nonce,id,resetHash,browserHash,now),
   this.q("UPDATE password_accounts SET password_hash=?,credential_version=?,updated_at=? WHERE user_id=? AND credential_version=? AND EXISTS(SELECT 1 FROM password_reset_requests WHERE id=? AND completion_nonce=? AND status='consumed')",passwordHash,version,at,row.user_id,row.credential_version,id,nonce),
   this.q("INSERT INTO shared_account_email_proofs(user_id,email,credential_version,method,verified_at) SELECT a.user_id,a.email,a.credential_version,'reset_email_otp',? FROM password_accounts a WHERE a.user_id=? AND a.credential_version=? AND a.disabled=0 AND EXISTS(SELECT 1 FROM password_reset_requests WHERE id=? AND completion_nonce=? AND status='consumed') ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,credential_version=excluded.credential_version,method=excluded.method,verified_at=excluded.verified_at",at,row.user_id,version,id,nonce),
   this.q("DELETE FROM auth_sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM password_reset_requests WHERE id=? AND completion_nonce=? AND status='consumed')",row.user_id,id,nonce),
   this.q("INSERT INTO audit(id,org_id,actor,action,target,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM password_reset_requests WHERE id=? AND completion_nonce=? AND status='consumed')",crypto.randomUUID(),row.org_id,row.user_id,'account.email-password-reset',row.user_id,at,id,nonce),
  ]);
  if(completed[0].meta.changes!==1||completed[1].meta.changes!==1)throw unavailable();return {success:true};
 }
}
