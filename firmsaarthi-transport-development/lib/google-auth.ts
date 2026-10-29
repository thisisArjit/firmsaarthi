import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { AuthService, businessName, normalizeEmail } from './auth';
import { AppError } from './service';
import { digest, randomToken, verifyPassword } from './passwords';
import type { Row } from './domain';

export type GoogleConfig={clientId:string;clientSecret:string;redirectUri:string};
export type GoogleIdentity={subject:string;email:string;hostedDomain?:string};
const keys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'),{timeoutDuration:8000});
const now=()=>Math.floor(Date.now()/1000);
export const flowCookieName=()=>process.env.NODE_ENV==='production'?'__Host-tms_google':'tms_google';
export function flowCookie(token:string,age=600){return `${flowCookieName()}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${process.env.NODE_ENV==='production'?'; Secure':''}`;}
export function flowBrowser(cookie:string|null){return (cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(flowCookieName()+'='))?.slice(flowCookieName().length+1)||'';}
export function googleConfig(values:{GOOGLE_CLIENT_ID?:string;GOOGLE_CLIENT_SECRET?:string;GOOGLE_REDIRECT_URI?:string}):GoogleConfig|null{
  if(!values.GOOGLE_CLIENT_ID||!values.GOOGLE_CLIENT_SECRET||!values.GOOGLE_REDIRECT_URI)return null;
  try{const url=new URL(values.GOOGLE_REDIRECT_URI);if(url.pathname!=='/api/auth/google/callback'||url.search||url.hash||url.username||url.password||!(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname))))return null;}catch{return null;}
  return {clientId:values.GOOGLE_CLIENT_ID,clientSecret:values.GOOGLE_CLIENT_SECRET,redirectUri:values.GOOGLE_REDIRECT_URI};
}
export async function verifyGoogleToken(token:string,clientId:string,nonce:string,key:JWTVerifyGetKey=keys){
  const {payload}=await jwtVerify(token,key,{algorithms:['RS256'],issuer:['https://accounts.google.com','accounts.google.com'],audience:clientId,requiredClaims:['exp','iat','sub','nonce','email','email_verified'],maxTokenAge:'10m',clockTolerance:5});
  if(payload.nonce!==nonce||payload.email_verified!==true||typeof payload.sub!=='string'||!payload.sub||payload.sub.length>255||(payload.azp!==undefined&&payload.azp!==clientId))throw new AppError('Google could not verify this sign-in. Please try again.',401);
  if(payload.hd!==undefined&&(typeof payload.hd!=='string'||payload.hd.length>253||!/^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(payload.hd)))throw new AppError('Google could not verify this sign-in. Please try again.',401);
  return {subject:payload.sub,email:normalizeEmail(payload.email),...(payload.hd?{hostedDomain:String(payload.hd).toLowerCase()}:{})};
}

export class GoogleAuth {
  auth:AuthService;
  constructor(public db:D1Database,public config:GoogleConfig){this.auth=new AuthService(db);}
  async start(intent:unknown,name:unknown,cookie:string|null,password:unknown,ip:string){
    if(!['login','signup','link'].includes(String(intent)))throw new AppError('Choose sign in, sign up or link account.');
    await this.auth.limit(`google-start:${ip}`,ip);
    let userId:string|null=null,version:string|null=null;
    if(intent==='link'){
      const user=await this.auth.user(cookie);if(!user)throw new AppError('Sign in before linking Google.',401);
      const account=await this.auth.q('SELECT * FROM password_accounts WHERE user_id=? AND disabled=0',user.userId).first<Row>();
      await this.auth.limit(`google-link:${user.userId}`,ip);
      if(!account||!await verifyPassword(password,account.password_hash))throw new AppError('Current password is incorrect.',401);
      userId=user.userId;version=account.credential_version;
    }else if(await this.auth.user(cookie))throw new AppError('Sign out before using another account.',409);
    const business=intent==='signup'?businessName(name):'',state=randomToken(),browser=randomToken(),nonce=randomToken(),verifier=randomToken();
    await this.db.batch([
      this.auth.q('DELETE FROM google_flows WHERE expires_at<=?',now()),
      this.auth.q('INSERT INTO google_flows VALUES (?,?,?,?,?,?,?,?,?)',await digest(state),await digest(browser),nonce,verifier,intent,userId,version,business,now()+600),
    ]);
    const challenge=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
    const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');url.search=new URLSearchParams({client_id:this.config.clientId,redirect_uri:this.config.redirectUri,response_type:'code',scope:'openid email',state,nonce,code_challenge:challenge,code_challenge_method:'S256',prompt:'select_account'}).toString();
    return {url:url.toString(),browser};
  }
  async consume(state:string,browser:string){
    if(!/^[a-f0-9]{64}$/.test(state)||!/^[a-f0-9]{64}$/.test(browser))throw new AppError('Google sign-in expired. Please try again.',401);
    const result=await this.auth.q('DELETE FROM google_flows WHERE state_hash=? AND browser_hash=? AND expires_at>? RETURNING *',await digest(state),await digest(browser),now()).all<Row>();
    const flow=result.results[0];if(!flow)throw new AppError('Google sign-in expired. Please try again.',401);return flow;
  }
  async exchange(code:string,flow:Row,fetcher:typeof fetch=fetch,key:JWTVerifyGetKey=keys){
    if(!code||code.length>4096)throw new AppError('Google sign-in failed.',401);
    const response=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:this.config.clientId,client_secret:this.config.clientSecret,redirect_uri:this.config.redirectUri,grant_type:'authorization_code',code_verifier:flow.verifier}),signal:AbortSignal.timeout(10000),redirect:'manual'});
    if(!response.ok)throw new AppError('Google sign-in failed. Please try again.',401);
    const text=await response.text();if(text.length>32768)throw new AppError('Google sign-in failed.',401);
    const body=JSON.parse(text);if(typeof body.id_token!=='string')throw new AppError('Google sign-in failed.',401);
    return verifyGoogleToken(body.id_token,this.config.clientId,flow.nonce,key);
  }
  async complete(flow:Row,google:GoogleIdentity,cookie:string|null){
    const linked=await this.auth.q('SELECT g.user_id,a.credential_version,a.disabled FROM google_identities g JOIN password_accounts a ON a.user_id=g.user_id WHERE g.subject=?',google.subject).first<Row>();
    if(flow.intent==='link'){
      const user=await this.auth.user(cookie);if(!user||user.userId!==flow.user_id)throw new AppError('Sign in again before linking Google.',401);
      const account=await this.auth.q('SELECT a.*,m.org_id FROM password_accounts a JOIN memberships m ON m.user_id=a.user_id WHERE a.user_id=? AND a.disabled=0 AND a.credential_version=?',user.userId,flow.credential_version).first<Row>();
      if(!account||account.email!==google.email)throw new AppError('Use the Google account with the same email as your FirmSaarthi account.',409);
      if(linked&&linked.user_id!==user.userId)throw new AppError('This Google account is already linked to another account.',409);
      const existing=await this.auth.q('SELECT subject FROM google_identities WHERE user_id=?',user.userId).first<Row>();
      if(existing&&existing.subject!==google.subject)throw new AppError('A different Google account is already linked.',409);
      if(!existing)await this.db.batch([
        this.auth.q('INSERT INTO google_identities SELECT ?,a.user_id,?,? FROM password_accounts a JOIN memberships m ON m.user_id=a.user_id WHERE a.user_id=? AND a.credential_version=? AND a.disabled=0',google.subject,google.email,new Date().toISOString(),user.userId,flow.credential_version),
        this.auth.q('INSERT INTO audit VALUES (?,?,?,?,?,?)',crypto.randomUUID(),account.org_id,user.userId,'account.google.link',user.userId,new Date().toISOString()),
      ]);
      return this.auth.issue(user.userId,account.credential_version);
    }
    if(await this.auth.user(cookie))throw new AppError('Sign out before using another account.',409);
    if(linked){if(linked.disabled)throw new AppError('This account is unavailable. Contact your workspace owner.',403);return this.auth.issue(linked.user_id,linked.credential_version);}
    const account=await this.auth.q('SELECT a.*,m.org_id,m.role FROM password_accounts a LEFT JOIN memberships m ON m.user_id=a.user_id WHERE a.email=?',google.email).first<Row>();
    if(account){
      if(account.disabled||!account.org_id||!['OWNER','MEMBER','DISPATCHER'].includes(account.role))throw new AppError('This account is unavailable. Contact your workspace owner.',403);
      // These values come only from a signature/issuer/audience/nonce-verified
      // Google ID token. External email addresses still need an ownership challenge.
      if(!google.email.endsWith('@gmail.com')&&!google.hostedDomain)throw new AppError('Sign in with your existing password, then link Google in My account.',409);
      const existing=await this.auth.q('SELECT subject FROM google_identities WHERE user_id=?',account.user_id).first<Row>();
      if(existing&&existing.subject!==google.subject)throw new AppError('A different Google account is already linked. Contact your workspace owner.',409);
      const at=new Date().toISOString();
      try{await this.db.batch([
        this.auth.q("INSERT INTO google_identities SELECT ?,a.user_id,?,? FROM password_accounts a JOIN memberships m ON m.user_id=a.user_id WHERE a.user_id=? AND a.email=? AND a.credential_version=? AND a.disabled=0 AND m.org_id=? AND m.role IN ('OWNER','MEMBER','DISPATCHER')",google.subject,google.email,at,account.user_id,google.email,account.credential_version,account.org_id),
        this.auth.q('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',crypto.randomUUID(),account.org_id,account.user_id,'account.google.auto-link',account.user_id,at),
      ]);}catch{
        // Concurrent first sign-ins may have linked the same exact identity.
        // Never replace a conflicting provider identity or create another workspace.
        const won=await this.auth.q('SELECT user_id FROM google_identities WHERE subject=?',google.subject).first<Row>();
        if(won?.user_id!==account.user_id)throw new AppError('Unable to link this Google sign-in. Please try again.',409);
      }
      const attached=await this.auth.q('SELECT user_id FROM google_identities WHERE subject=?',google.subject).first<Row>();
      if(attached?.user_id!==account.user_id)throw new AppError('This account changed. Please try signing in again.',409);
      return this.auth.issue(account.user_id,account.credential_version);
    }
    if(flow.intent!=='signup')throw new AppError('No linked account found. Choose Create account, or sign in with your password to link Google.',404);
    // Account, organization and provider identity are created in one transaction.
    // Email matches never grant a membership or merge existing business records.
    const userId=crypto.randomUUID(),orgId=crypto.randomUUID(),version=crypto.randomUUID(),at=new Date().toISOString(),business=businessName(flow.business_name);
    try{await this.db.batch([
      this.auth.q('INSERT INTO organizations (id,owner_id,name,profile,created_at) VALUES (?,?,?,?,?)',orgId,userId,business,JSON.stringify({transportName:business}),at),
      this.auth.q('INSERT INTO password_accounts VALUES (?,?,?,?,0,?)',userId,google.email,'google-only$',version,at),
      this.auth.q('INSERT INTO memberships VALUES (?,?,?,?,?)',userId,orgId,google.email,'OWNER',at),
      this.auth.q('INSERT INTO google_identities VALUES (?,?,?,?)',google.subject,userId,google.email,at),
      this.auth.q('INSERT INTO audit VALUES (?,?,?,?,?,?)',crypto.randomUUID(),orgId,userId,'account.google.signup',userId,at),
    ]);}catch{throw new AppError('Unable to create the account. Try signing in instead.',409);}
    return this.auth.issue(userId,version);
  }
}
