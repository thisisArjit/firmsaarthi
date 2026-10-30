import {AppError} from './service';
import {PasswordReset,type ResetSender} from './password-reset';
import {digest,hashPassword,hex,randomToken} from './passwords';
import {validateSignupPassword} from './signup-email-proof';
import type {Row} from './domain';
type Target={userId:string;orgId:string;role:string;credentialVersion:string;email:string;subject:string};
/** Only GoogleAuth constructs this after verifying its own browser-bound OIDC flow. */
export class GoogleAccountClaimRequired extends AppError{constructor(public target:Target){super('Confirm your email and choose a fresh password to secure this existing profile.',409);}}
export const claimCookieName=()=>process.env.NODE_ENV==='production'?'__Host-tms_google_claim':'tms_google_claim';
export const claimResetCookieName=()=>process.env.NODE_ENV==='production'?'__Host-tms_claim_reset':'tms_claim_reset';
export const claimReadyCookieName=()=>process.env.NODE_ENV==='production'?'__Host-tms_claim_ready':'tms_claim_ready';
export function claimCookie(name:string,value:string,age=600){return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${process.env.NODE_ENV==='production'?'; Secure':''}`;}
function pair(cookie:string|null,name:string){const v=(cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1);return v&&/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(v)?v.split('.'):null;}
export function claimSession(cookie:string|null){const p=pair(cookie,claimCookieName());return p?{id:p[0],proof:p[1]}:null;}
export function claimResetSession(cookie:string|null){const p=pair(cookie,claimResetCookieName()),ready=pair(cookie,claimReadyCookieName());return p?{requestId:p[0],proof:p[1],ready:ready?.[0]===p[0]?ready[1]:null}:null;}
const invalid=()=>new AppError('This sign-in review expired or the account changed. Continue with Google again.',409);
const token=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export class GoogleAccountClaim{
 private reset:PasswordReset;
 constructor(private db:D1Database,private secret:string,send:ResetSender,private clock=()=>Date.now(),budget=70){this.reset=new PasswordReset(db,secret,send,clock,budget);}
 private q(sql:string,...args:any[]){return this.db.prepare(sql).bind(...args);}
 private now(){return Math.floor(this.clock()/1000);}
 private async mac(value:string){if(!/^[a-f0-9]{64}$/.test(this.secret))throw new AppError('Email confirmation is temporarily unavailable.',503);const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(this.secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('google-account-claim:v1:'+value))));}
 async start(target:Target){
  const account=await this.q("SELECT a.user_id FROM password_accounts a JOIN memberships m ON m.user_id=a.user_id WHERE a.user_id=? AND a.email=? AND a.credential_version=? AND a.disabled=0 AND m.org_id=? AND m.role=? AND m.role IN ('OWNER','MEMBER','DISPATCHER') AND NOT EXISTS(SELECT 1 FROM google_identities WHERE user_id=a.user_id OR subject=?)",target.userId,target.email,target.credentialVersion,target.orgId,target.role,target.subject).first();if(!account)throw invalid();
  const id=randomToken(),proof=randomToken();await this.db.batch([this.q("INSERT INTO google_account_claims(id,browser_hash,subject,email,user_id,org_id,role,credential_version,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)",await digest(id),await digest(proof),target.subject,target.email,target.userId,target.orgId,target.role,target.credentialVersion,this.now(),this.now()+600),this.q('DELETE FROM google_account_claims WHERE expires_at<?',this.now()-86400)]);return {id,proof};
 }
 private async row(session:ReturnType<typeof claimSession>){if(!session||!token(session.id)||!token(session.proof))throw invalid();const r=await this.q("SELECT * FROM google_account_claims WHERE id=? AND browser_hash=? AND status IN ('pending','consumed') AND expires_at>?",await digest(session.id),await digest(session.proof),this.now()).first<Row>();if(!r)throw invalid();return r;}
 private async current(row:Row){const version=row.status==='consumed'?row.new_credential_version:row.credential_version;const a=await this.q("SELECT a.user_id FROM password_accounts a JOIN memberships m ON m.user_id=a.user_id WHERE a.user_id=? AND a.email=? AND a.credential_version=? AND a.disabled=0 AND m.org_id=? AND m.role=?",row.user_id,row.email,version,row.org_id,row.role).first();if(!a)throw invalid();return a;}
 async authorize(session:ReturnType<typeof claimSession>,userId?:string){const row=await this.row(session);if(userId&&row.user_id!==userId)throw invalid();}
 async progress(session:ReturnType<typeof claimSession>,reset:ReturnType<typeof claimResetSession>){const row=await this.row(session);await this.current(row);const business=async()=>({businessName:String((await this.q('SELECT name FROM organizations WHERE id=?',row.org_id).first<Row>())?.name||''),role:row.role});if(row.status==='consumed')return {step:'details',email:row.email,completed:true,...await business()};if(reset&&row.reset_id===await digest(reset.requestId)){const r=await this.q("SELECT status,reset_hash FROM password_reset_requests WHERE id=? AND browser_hash=? AND expires_at>?",row.reset_id,await digest(reset.proof),this.now()).first<Row>();if(r?.status==='verified'&&reset.ready&&r.reset_hash===await digest(reset.ready))return {step:'details',email:row.email,...await business()};if(r?.status==='sent')return {step:'code',email:row.email};}return {step:'email',email:row.email};}
 async request(session:ReturnType<typeof claimSession>,ip:string){const row=await this.row(session);await this.current(row);if(row.status!=='pending')throw invalid();const r=await this.reset.request(row.email,ip);await this.q("UPDATE google_account_claims SET reset_id=? WHERE id=? AND browser_hash=? AND status='pending' AND expires_at>?",await digest(r.requestId),row.id,row.browser_hash,this.now()).run();return r;}
 async verify(session:ReturnType<typeof claimSession>,reset:ReturnType<typeof claimResetSession>,code:unknown,ip:string){const row=await this.row(session);await this.current(row);if(row.status!=='pending'||!reset||row.reset_id!==await digest(reset.requestId))throw invalid();return this.reset.verify(reset.requestId,code,reset.proof,ip);}
 async complete(session:ReturnType<typeof claimSession>,reset:ReturnType<typeof claimResetSession>,password:unknown,confirm:unknown,currentUserId?:string,ip='unknown'){
  const bucket=Math.floor(this.now()/900),key=`google-claim-complete:${await this.mac(ip)}:${bucket}`,limited=await this.q('INSERT INTO auth_limits(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts',key,(bucket+2)*900).run();if(Number((limited.results?.[0] as Row)?.attempts)>20)throw new AppError('Too many sign-in review attempts. Try again later.',429);
  if(confirm!==true)throw new AppError('Confirm the fresh-password change, Google link and sign-out of earlier sessions.');validateSignupPassword(password);const row=await this.row(session);if(currentUserId&&currentUserId!==row.user_id)throw invalid();if(!reset?.ready||row.reset_id!==await digest(reset.requestId))throw invalid();
  const browserHash=await digest(reset.proof),resetHash=await digest(reset.ready),completionDigest=await this.mac(JSON.stringify([row.id,row.browser_hash,row.subject,row.user_id,row.reset_id,browserHash,resetHash,password]));
  const receipt=async(r:Row)=>{if(r.completion_digest!==completionDigest)throw invalid();await this.current(r);const linked=await this.q('SELECT user_id FROM google_identities WHERE subject=? AND user_id=?',r.subject,r.user_id).first();if(!linked)throw invalid();return {userId:r.user_id as string,credentialVersion:r.new_credential_version as string,alreadyCompleted:true};};
  if(row.status==='consumed')return receipt(row);
  const proof=await this.q("SELECT id FROM password_reset_requests WHERE id=? AND browser_hash=? AND reset_hash=? AND status='verified' AND expires_at>? AND user_id=? AND account_email=? AND credential_version=? AND org_id=? AND role=?",row.reset_id,browserHash,resetHash,this.now(),row.user_id,row.email,row.credential_version,row.org_id,row.role).first();
  if(!proof){
   // An exact concurrent completion can consume proof between our claim read
   // and this read. Confirm only its matching committed receipt; an ordinary
   // reset or different payload still fails without another credential write.
   const winner=await this.row(session);if(winner.status==='consumed')return receipt(winner);throw invalid();
  }
  const hash=await hashPassword(password),version=crypto.randomUUID(),nonce=randomToken(),now=this.now(),at=new Date(this.clock()).toISOString(),guard="EXISTS(SELECT 1 FROM google_account_claims WHERE id=? AND completion_nonce=? AND status='consumed')";
  let done:D1Result[];try{done=await this.db.batch([
   this.q("UPDATE google_account_claims SET status='consumed',completion_nonce=?,completion_digest=?,new_credential_version=? WHERE id=? AND browser_hash=? AND status='pending' AND expires_at>? AND NOT EXISTS(SELECT 1 FROM google_identities WHERE user_id=google_account_claims.user_id OR subject=google_account_claims.subject) AND EXISTS(SELECT 1 FROM password_accounts a JOIN memberships m ON m.user_id=a.user_id WHERE a.user_id=google_account_claims.user_id AND a.email=google_account_claims.email AND a.credential_version=google_account_claims.credential_version AND a.disabled=0 AND m.org_id=google_account_claims.org_id AND m.role=google_account_claims.role) AND EXISTS(SELECT 1 FROM password_reset_requests r WHERE r.id=google_account_claims.reset_id AND r.browser_hash=? AND r.reset_hash=? AND r.status='verified' AND r.expires_at>? AND r.user_id=google_account_claims.user_id AND r.account_email=google_account_claims.email AND r.credential_version=google_account_claims.credential_version AND r.org_id=google_account_claims.org_id AND r.role=google_account_claims.role)",nonce,completionDigest,version,row.id,row.browser_hash,now,browserHash,resetHash,now),
   this.q(`UPDATE password_reset_requests SET status='consumed',completion_nonce=?,reset_hash=NULL WHERE id=? AND status='verified' AND ${guard}`,nonce,row.reset_id,row.id,nonce),
   this.q(`UPDATE password_accounts SET password_hash=?,credential_version=?,updated_at=? WHERE user_id=? AND credential_version=? AND ${guard}`,hash,version,at,row.user_id,row.credential_version,row.id,nonce),
   this.q(`DELETE FROM auth_sessions WHERE user_id=? AND ${guard}`,row.user_id,row.id,nonce),
   this.q(`INSERT INTO google_identities(subject,user_id,email,created_at) SELECT ?,?,?,? WHERE ${guard}`,row.subject,row.user_id,row.email,at,row.id,nonce),
   // A dependent write failure must roll back the entire batch, never leave a
   // changed password with missing identity proof. 'invalid' violates schema CHECK.
   this.q("UPDATE google_account_claims SET status=CASE WHEN EXISTS(SELECT 1 FROM password_accounts a JOIN google_identities g ON g.user_id=a.user_id JOIN password_reset_requests r ON r.user_id=a.user_id WHERE a.user_id=google_account_claims.user_id AND a.email=google_account_claims.email AND a.credential_version=google_account_claims.new_credential_version AND a.disabled=0 AND g.subject=google_account_claims.subject AND r.id=google_account_claims.reset_id AND r.status='consumed' AND r.completion_nonce=google_account_claims.completion_nonce) AND NOT EXISTS(SELECT 1 FROM auth_sessions WHERE user_id=google_account_claims.user_id) THEN 'consumed' ELSE 'invalid' END WHERE id=? AND completion_nonce=?",row.id,nonce),
   this.q(`INSERT INTO audit(id,org_id,actor,action,target,created_at) SELECT ?,?,?,'account.google.email-claim',?,? WHERE ${guard}`,crypto.randomUUID(),row.org_id,row.user_id,row.user_id,at,row.id,nonce),
  ]);}catch{throw invalid();}
  if(done[0].meta.changes!==1){const winner=await this.row(session);if(winner.status==='consumed')return receipt(winner);throw invalid();}
  return {userId:row.user_id as string,credentialVersion:version,alreadyCompleted:false};
 }
 async cancel(session:ReturnType<typeof claimSession>){if(session)await this.q("UPDATE google_account_claims SET status='cancelled' WHERE id=? AND browser_hash=? AND status='pending'",await digest(session.id),await digest(session.proof)).run();}
}
