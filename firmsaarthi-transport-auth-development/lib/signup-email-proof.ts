import {AppError} from './service';
import {businessName,normalizeEmail} from './auth';
import {digest,hashPassword,hex,randomToken} from './passwords';
import type {Row} from './domain';

export type SignupMail={to:string;code:string;requestId:string};
export type SignupSender=(mail:SignupMail)=>Promise<void>;
export type SignupReceipt={userId:string;orgId:string;credentialVersion:string;alreadyCreated:boolean};
const unavailable=()=>new AppError('This registration session is invalid or expired. Request a new code.',400);
const invalid=()=>new AppError('The code is incorrect or expired. Check it or request a new code.',400);
const token=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const equal=(a:string,b:string)=>{let n=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)n|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return n===0;};
export function validateSignupPassword(value:unknown):asserts value is string{
 if(typeof value!=='string'||value.length>128||Array.from(value).length<15)throw new AppError('Use a password of 15 to 128 characters.');
}

/** Unwired candidate service. Existing signup/login/Google behavior is unchanged.
 * Password and business name are chosen AFTER mailbox proof, never emailed or
 * stored in a pending challenge. A caller must keep proof in an HttpOnly cookie.
 */
export class SignupEmailProof{
 constructor(private db:D1Database,private secret:string,private send:SignupSender,private clock=()=>Date.now(),private dailyBudget=70){
  if(!Number.isSafeInteger(dailyBudget)||dailyBudget<1||dailyBudget>70)throw new AppError('Email registration is temporarily unavailable.',503);
 }
 private now(){return Math.floor(this.clock()/1000);}
 private q(sql:string,...args:any[]){return this.db.prepare(sql).bind(...args);}
 private async hmac(value:string){
  if(!/^[a-f0-9]{64}$/.test(this.secret))throw new AppError('Email registration is temporarily unavailable.',503);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(this.secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value))));
 }
 private mac(value:string){return this.hmac('signup-email:v1:'+value);}
 private async limit(purpose:string,subject:string,maximum:number,seconds:number){
  const bucket=Math.floor(this.now()/seconds),key=`signup-proof:${purpose}:${await this.mac(subject)}:${bucket}`;
  const r=await this.q('INSERT INTO auth_limits(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts',key,(bucket+2)*seconds).run();
  if(Number((r.results?.[0] as Row)?.attempts)>maximum)throw new AppError('Too many registration attempts. Please try again later.',429);
 }
 private async deliveryBudget(){
  // Deliberately identical to PasswordReset's existing budget key. With the
  // same protected email secret, signup and reset share ONE daily allowance.
  const bucket=Math.floor(this.now()/86400),key=`reset:delivery-budget:${await this.hmac('all')}:${bucket}`;
  const r=await this.q('INSERT INTO auth_limits(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts',key,(bucket+2)*86400).run();
  if(Number((r.results?.[0] as Row)?.attempts)>this.dailyBudget)throw new AppError('Email registration is temporarily unavailable. Try again later.',429);
 }
 async request(email:unknown,ip:string){
  const normalized=normalizeEmail(email),now=this.now(),subject=await this.mac('email:'+normalized);
  await this.limit('request-ip',ip,10,900);await this.limit('request-email',normalized,3,900);
  if(await this.q('SELECT id FROM signup_email_proofs WHERE subject_hash=? AND created_at>? LIMIT 1',subject,now-60).first())throw new AppError('Wait one minute before requesting another code.',429);
  await this.deliveryBudget();
  const exists=await this.q('SELECT user_id FROM password_accounts WHERE email=?',normalized).first<Row>();
  const requestId=randomToken(),proof=randomToken(),id=await digest(requestId),browserHash=await digest(proof);
  let n:number;do{n=crypto.getRandomValues(new Uint32Array(1))[0];}while(n>=4294000000);
  const code=String(n%1000000).padStart(6,'0');
  await this.db.batch([
   this.q("INSERT INTO signup_email_proofs(id,subject_hash,email,browser_hash,code_hash,status,created_at,expires_at) VALUES(?,?,?,?,?,'pending',?,?)",id,subject,normalized,browserHash,await this.mac(`code:${id}:${browserHash}:${code}`),now,now+600),
   this.q('DELETE FROM signup_email_proofs WHERE expires_at<?',now-86400),this.q('DELETE FROM auth_limits WHERE expires_at<=?',now),
  ]);
  try{
   if(!exists)await this.send({to:normalized,code,requestId:id});
   await this.q("UPDATE signup_email_proofs SET status=?,code_hash=CASE WHEN ? THEN code_hash ELSE '' END WHERE id=? AND status='pending'",exists?'failed':'sent',exists?0:1,id).run();
  }catch{await this.q("UPDATE signup_email_proofs SET status='failed',code_hash='' WHERE id=? AND status='pending'",id).run();}
  return {requestId,proof,message:'If this email can create a new account, a code will arrive shortly. It expires in 10 minutes. Existing users can sign in or reset their password.'};
 }
 async verify(requestId:unknown,code:unknown,proof:string|null,ip:string){
  await this.limit('verify-ip',ip,30,900);
  if(!token(requestId)||!token(proof)||typeof code!=='string'||!/^\d{6}$/.test(code))throw invalid();
  const id=await digest(requestId),browserHash=await digest(proof),now=this.now();
  const r=await this.q("UPDATE signup_email_proofs SET attempts=attempts+1 WHERE id=? AND browser_hash=? AND status='sent' AND expires_at>? AND attempts<5 RETURNING *",id,browserHash,now).run(),row=r.results?.[0] as Row|undefined;
  if(!row||!equal(await this.mac(`code:${id}:${browserHash}:${code}`),row.code_hash))throw invalid();
  const registrationToken=randomToken();
  const claimed=await this.q("UPDATE signup_email_proofs SET status='verified',code_hash='',registration_hash=?,expires_at=MIN(expires_at,?) WHERE id=? AND status='sent' AND attempts=? AND expires_at>?",await digest(registrationToken),this.now()+300,id,row.attempts,this.now()).run();
  if(claimed.meta.changes!==1)throw invalid();return {registrationToken};
 }
 private async receipt(row:Row,completionDigest:string):Promise<SignupReceipt>{
  if(!row.completion_digest||!equal(row.completion_digest,completionDigest))throw new AppError('This request already created an account with different details. Sign in instead.',409);
  const account=await this.q("SELECT a.user_id FROM password_accounts a JOIN memberships m ON m.user_id=a.user_id JOIN account_email_proofs p ON p.user_id=a.user_id WHERE a.user_id=? AND a.email=? AND a.credential_version=? AND a.disabled=0 AND m.org_id=? AND m.role='OWNER' AND p.email=a.email AND p.credential_version=a.credential_version AND p.request_id=?",row.user_id,row.email,row.credential_version,row.org_id,row.id).first<Row>();
  if(!account)throw unavailable();
  return {userId:row.user_id,orgId:row.org_id,credentialVersion:row.credential_version,alreadyCreated:true};
 }
 async complete(requestId:unknown,registrationToken:unknown,password:unknown,name:unknown,proof:string|null,ip:string):Promise<SignupReceipt>{
  await this.limit('complete-ip',ip,20,900);
  if(!token(requestId)||!token(registrationToken)||!token(proof))throw unavailable();
  validateSignupPassword(password);const business=businessName(name),id=await digest(requestId),browserHash=await digest(proof),registrationHash=await digest(registrationToken);
  const row=await this.q("SELECT * FROM signup_email_proofs WHERE id=? AND browser_hash=? AND registration_hash=? AND status IN ('verified','consumed') AND expires_at>?",id,browserHash,registrationHash,this.now()).first<Row>();
  if(!row)throw unavailable();
  const completionDigest=await this.mac('complete:'+JSON.stringify([id,browserHash,row.email,business,password]));
  if(row.status==='consumed')return this.receipt(row,completionDigest);
  const userId=crypto.randomUUID(),orgId=crypto.randomUUID(),version=crypto.randomUUID(),nonce=randomToken(),at=new Date(this.clock()).toISOString(),hash=await hashPassword(password),now=this.now();
  const guard="EXISTS(SELECT 1 FROM signup_email_proofs WHERE id=? AND status='consumed' AND completion_nonce=?)";
  let result:D1Result[];
  try{result=await this.db.batch([
   this.q("UPDATE signup_email_proofs SET status='consumed',completion_nonce=?,completion_digest=?,user_id=?,org_id=?,credential_version=? WHERE id=? AND browser_hash=? AND registration_hash=? AND status='verified' AND expires_at>? AND NOT EXISTS(SELECT 1 FROM password_accounts WHERE email=signup_email_proofs.email)",nonce,completionDigest,userId,orgId,version,id,browserHash,registrationHash,now),
   this.q(`INSERT INTO organizations(id,owner_id,name,profile,created_at) SELECT ?,?,?,?,? WHERE ${guard}`,orgId,userId,business,JSON.stringify({transportName:business}),at,id,nonce),
   this.q(`INSERT INTO password_accounts(user_id,email,password_hash,credential_version,disabled,updated_at) SELECT ?,?,?,?,0,? WHERE ${guard}`,userId,row.email,hash,version,at,id,nonce),
   this.q(`INSERT INTO memberships(user_id,org_id,email,role,joined_at) SELECT ?,?,?,'OWNER',? WHERE ${guard}`,userId,orgId,row.email,at,id,nonce),
   this.q(`INSERT INTO account_email_proofs(user_id,email,credential_version,method,verified_at,request_id) SELECT ?,?,?,'signup_email_otp',?,? WHERE ${guard}`,userId,row.email,version,at,id,id,nonce),
   this.q(`INSERT INTO audit(id,org_id,actor,action,target,created_at) SELECT ?,?,?,'account.verified-signup',?,? WHERE ${guard}`,crypto.randomUUID(),orgId,userId,userId,at,id,nonce),
  ]);}catch{throw new AppError('Unable to create an account. Try signing in or request a new code.',409);}
  if(result[0].meta.changes!==1){
   const winner=await this.q("SELECT * FROM signup_email_proofs WHERE id=? AND browser_hash=? AND registration_hash=? AND status='consumed' AND expires_at>?",id,browserHash,registrationHash,this.now()).first<Row>();
   if(winner)return this.receipt(winner,completionDigest);
   throw new AppError('Unable to create an account. Try signing in or request a new code.',409);
  }
  return {userId,orgId,credentialVersion:version,alreadyCreated:false};
 }
}
