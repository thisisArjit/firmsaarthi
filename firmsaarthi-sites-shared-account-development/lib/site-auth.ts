import { createRemoteJWKSet, jwtVerify } from 'jose';
import { digest, SiteError } from './site-domain';
import { hashPassword, verifyPassword } from './passwords';
import type { SiteService, Row } from './site-service';
import {sharedEnabled,sharedCall,mailConfigured,sendMail} from './shared-integrations';
import {FirmSaarthiAccount} from './firmsaarthi-account';
const keys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'),{timeoutDuration:8000});
const random=()=>crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
export class SiteAuth {
  returnTo='/account';
  linkCookie='';
  constructor(public s: SiteService) {}
  cookie(name: string, token: string, age=7*86400) { const secure=new URL(this.s.request.url).protocol==='https:'; return `${secure?'__Host-':''}fs_sites_${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure?'; Secure':''}`; }
  readCookie(name: string) { const secure=new URL(this.s.request.url).protocol==='https:'; const prefix=`${secure?'__Host-':''}fs_sites_${name}=`; return (this.s.request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(prefix))?.slice(prefix.length)||''; }
  async user() { const token=this.readCookie('session'); if(!/^[a-f0-9]{64}$/.test(token)) return null; const row=await this.s.first('SELECT u.id,u.email,u.name,u.google_subject FROM site_sessions s JOIN site_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',await digest(token),this.s.now());if(row){try{await new FirmSaarthiAccount(this).session(row.id,await digest(token));}catch(e){if(e instanceof SiteError&&e.status===401)return null;throw e;}} return row?{id:row.id as string,email:row.email as string,name:row.name as string,googleLinked:!!row.google_subject}:null; }
  async requireUser() { const user=await this.user(); if(!user) throw new SiteError('Please sign in to continue.',401); return user; }
  async issue(id: string,sourceSessionHash?:string) { const token=random(); await this.s.stmt('INSERT INTO site_sessions(token_hash,user_id,expires_at) VALUES (?,?,?)',await digest(token),id,new Date(this.s.clock().getTime()+7*86400000).toISOString()).run();await new FirmSaarthiAccount(this).attach(id,await digest(token),sourceSessionHash); return this.cookie('session',token); }
  email(value: unknown) { if(typeof value!=='string'||value.length>254||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value)||/[\r\n]/.test(value)) throw new SiteError('Enter a valid email address.'); return value.trim().toLowerCase(); }
  googleEnabled() { return sharedEnabled(this.s.env)||!!this.s.env.GOOGLE_CLIENT_ID && !!this.s.env.GOOGLE_CLIENT_SECRET && !!this.s.env.GOOGLE_REDIRECT_URI; }
  async emailLimit(email: string,kind: string,max=8) { const key=await digest('auth:'+kind+':'+email+':'+this.s.now().slice(0,13)); const count=await this.s.first('INSERT INTO site_rate_limits(id,count,expires_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count',key,new Date(this.s.clock().getTime()+2*3600000).toISOString()); if(count!.count>max) throw new SiteError('Too many attempts. Please try again in an hour.',429); }
  async requestCode(value: unknown, purpose: string) {
    await this.s.limit('auth-code',12); const email=this.email(value); await this.emailLimit(email,'code',5);
    if(!['signup','reset','access'].includes(purpose)) throw new SiteError('Choose a valid account action.');
    if(!mailConfigured(this.s.env)) throw new SiteError('Email verification is being connected. Please try Google sign-in or contact firmsaarthi@gmail.com.',503);
    const existing=await this.s.first('SELECT id FROM site_users WHERE email=?',email), id=random();
    if((purpose==='signup'&&existing)||(purpose==='reset'&&!existing)) return {challenge:id,message:'If this email is eligible, a verification code has been sent.'};
    const randomValue=crypto.getRandomValues(new Uint32Array(1))[0], code=String(randomValue%1000000).padStart(6,'0');
    await this.s.db.batch([this.s.stmt('DELETE FROM site_email_codes WHERE email=? AND purpose=?',email,purpose),this.s.stmt('INSERT INTO site_email_codes(id,email,purpose,code_hash,expires_at) VALUES (?,?,?,?,?)',id,email,purpose,await digest(id+code),new Date(this.s.clock().getTime()+10*60000).toISOString())]);
    await sendMail(this.s.env,{id:'auth-'+id,to:email,subject:purpose==='reset'?'Reset your FirmSaarthi Sites password':'Your Sites by FirmSaarthi verification code',text:`Your verification code is ${code}. It expires in 10 minutes.\n\n${purpose==='access'?'Use it to verify your email and continue with your website. No password is needed.\n\n':''}Enter it only on Sites by FirmSaarthi. If you did not request it, you can ignore this email.`},this.s.transport);
    return {challenge:id,message:'If this email is eligible, a verification code has been sent.'};
  }
  async consumeCode(id: unknown,code: unknown,purpose: string) {
    await this.s.limit('auth-verify',30);
    if(typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id)||typeof code!=='string'||!/^\d{6}$/.test(code)) throw new SiteError('Enter the 6-digit email verification code.');
    const row=await this.s.first('UPDATE site_email_codes SET attempts=attempts+1 WHERE id=? AND purpose=? AND attempts<6 AND expires_at>? RETURNING *',id,purpose,this.s.now());
    if(!row || row.code_hash!==await digest(id+code)) throw new SiteError('The code is incorrect or has expired. Request a new code.');
    const used=await this.s.first('DELETE FROM site_email_codes WHERE id=? RETURNING email',id);
    if(!used) throw new SiteError('This code has already been used. Request a new code.');
    return used.email as string;
  }
  async signup(data: Row) {
    if(typeof data.password!=='string'||data.password.length<8||data.password.length>128) throw new SiteError('Use a password of 8–128 characters.');
    const name=String(data.name||'').trim().slice(0,100); if(!name) throw new SiteError('Enter your name.');
    const email=await this.consumeCode(data.challenge,data.code,'signup'), id=crypto.randomUUID();
    const password=await hashPassword(data.password);
    try { await this.s.stmt('INSERT INTO site_users(id,email,name,password_hash,created_at) VALUES (?,?,?,?,?)',id,email,name,password,this.s.now()).run(); } catch { throw new SiteError('Unable to create your account. Please sign in instead.',409); }
    return this.issue(id);
  }
  async verifyEmail(data: Row) {
    const sharedReview=this.readCookie('account_review');
    if(sharedReview){if(data.confirmSharedAccount!==true)throw new SiteError('Confirm linking this account and signing out earlier Sites sessions.');await new FirmSaarthiAccount(this).review();}
    const email=await this.consumeCode(data.challenge,data.code,'access');
    const name=String(data.name||email.split('@')[0]).trim().slice(0,100)||email.split('@')[0];
    await this.s.stmt('INSERT OR IGNORE INTO site_users(id,email,name,created_at) VALUES (?,?,?,?)',crypto.randomUUID(),email,name,this.s.now()).run();
    const user=await this.s.first('SELECT id,google_subject FROM site_users WHERE email=?',email);
    if(!user)throw new SiteError('Please request a new verification code.',409);
    const token=this.readCookie('link');
    if(/^[a-f0-9]{64}$/.test(token)){
      const link=await this.s.first('DELETE FROM site_identity_links WHERE token_hash=? AND email=? AND expires_at>? RETURNING subject',await digest(token),email,this.s.now());
      if(link){
        const connected=await this.s.first('UPDATE site_users SET google_subject=? WHERE id=? AND (google_subject IS NULL OR google_subject=?) RETURNING id',link.subject,user.id,link.subject);
        if(!connected)throw new SiteError('A different Google account is already connected. Use your email code to sign in.',409);
      }
    }
    if(sharedReview){const p=await new FirmSaarthiAccount(this).bindEmail(user.id,email,data.confirmSharedAccount);return this.issue(user.id,p.sessionHash);}
    return this.issue(user.id);
  }
  async login(data: Row) {
    await this.s.limit('login',30); const email=this.email(data.email); await this.emailLimit(email,'login');
    const row=await this.s.first('SELECT * FROM site_users WHERE email=?',email);
    const dummy='scrypt$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000';
    const valid=await verifyPassword(data.password,row?.password_hash||dummy);
    if(!row||!valid) throw new SiteError('Email or password is incorrect.',401);
    return this.issue(row.id);
  }
  async reset(data: Row) {
    if(typeof data.password!=='string'||data.password.length<8||data.password.length>128) throw new SiteError('Use a password of 8–128 characters.');
    const email=await this.consumeCode(data.challenge,data.code,'reset'), row=await this.s.first('SELECT id FROM site_users WHERE email=?',email);
    if(!row) throw new SiteError('Unable to reset this account.');
    const hash=await hashPassword(data.password);
    await this.s.db.batch([this.s.stmt('UPDATE site_users SET password_hash=? WHERE id=?',hash,row.id),this.s.stmt('DELETE FROM site_sessions WHERE user_id=?',row.id)]);
    return this.issue(row.id);
  }
  async logout() { const token=this.readCookie('session'); if(token) await this.s.stmt('DELETE FROM site_sessions WHERE token_hash=?',await digest(token)).run(); return this.cookie('session','',0); }
  async startGoogle() {
    if(!this.googleEnabled()) throw new SiteError('Google sign-in is being connected. Please use email sign-in.',503);
    const redirect=new URL(this.s.env.GOOGLE_REDIRECT_URI||new URL('/api/auth/google/callback',this.s.request.url));
    if(!sharedEnabled(this.s.env)&&(redirect.origin!==new URL(this.s.request.url).origin || redirect.pathname!=='/api/auth/google/callback')) throw new SiteError('Open the main Sites by FirmSaarthi address to use Google sign-in.');
    await this.s.limit('google',30); const user=await this.user();
    const state=random(),browser=random(),nonce=random(),verifier=random();
    const next=new URL(this.s.request.url).searchParams.get('next')||'/account',returnTo=next.startsWith('/')&&!next.startsWith('//')&&!next.includes('\\')?next:'/account';
    await this.s.stmt('INSERT INTO site_google_flows(state_hash,browser_hash,nonce,verifier,expires_at,link_user,return_to) VALUES (?,?,?,?,?,?,?)',await digest(state),await digest(browser),nonce,verifier,new Date(this.s.clock().getTime()+10*60000).toISOString(),user?.id||null,returnTo).run();
    if(sharedEnabled(this.s.env)){const result=await sharedCall(this.s.env,{action:'google-start',state},this.s.transport);return {url:result.url,cookie:this.cookie('google',browser,600)};}
    const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
    const challenge=btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
    const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');u.search=new URLSearchParams({client_id:this.s.env.GOOGLE_CLIENT_ID!,redirect_uri:redirect.href,response_type:'code',scope:'openid email profile',state,nonce,code_challenge:challenge,code_challenge_method:'S256',prompt:'select_account'}).toString();
    return {url:u.href,cookie:this.cookie('google',browser,600)};
  }
  async finishGoogle(url: URL) {
    if(!this.googleEnabled()) throw new SiteError('Google sign-in is unavailable.',503);
    const state=url.searchParams.get('state')||'', browser=this.readCookie('google');
    if(!/^[a-f0-9]{64}$/.test(state)||!/^[a-f0-9]{64}$/.test(browser)) throw new SiteError('Google sign-in expired. Please try again.',401);
    const flow=await this.s.first('DELETE FROM site_google_flows WHERE state_hash=? AND browser_hash=? AND expires_at>? RETURNING *',await digest(state),await digest(browser),this.s.now());
    if(!flow)throw new SiteError('Google sign-in expired. Please try again.',401);
    this.returnTo=flow.return_to?.startsWith('/')&&!flow.return_to.startsWith('//')&&!flow.return_to.includes('\\')?flow.return_to:'/account';
    if(sharedEnabled(this.s.env)){
      const identity=await sharedCall(this.s.env,{action:'google-exchange',state,ticket:url.searchParams.get('ticket')||''},this.s.transport);
      return this.completeIdentity(flow,identity.subject,this.email(identity.email),identity.email.split('@')[0]);
    }
    const code=url.searchParams.get('code');
    if(!flow||!code||code.length>4096||url.searchParams.has('error')) throw new SiteError('Google sign-in was cancelled or expired. Please try again.',401);
    const res=await this.s.transport('https://oauth2.googleapis.com/token',{method:'POST',signal:AbortSignal.timeout(10000),redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:this.s.env.GOOGLE_CLIENT_ID!,client_secret:this.s.env.GOOGLE_CLIENT_SECRET!,redirect_uri:this.s.env.GOOGLE_REDIRECT_URI!,grant_type:'authorization_code',code_verifier:flow.verifier})});
    if(!res.ok) throw new SiteError('Google could not complete sign-in. Please try again.',401);
    const tokens=await res.json() as Row;
    const {payload}=await jwtVerify(tokens.id_token,keys,{algorithms:['RS256'],issuer:['https://accounts.google.com','accounts.google.com'],audience:this.s.env.GOOGLE_CLIENT_ID!,requiredClaims:['sub','email','email_verified','nonce','exp','iat'],maxTokenAge:'10m',clockTolerance:5});
    if(payload.nonce!==flow.nonce || payload.email_verified!==true || typeof payload.sub!=='string' || (payload.azp!==undefined&&payload.azp!==this.s.env.GOOGLE_CLIENT_ID)) throw new SiteError('Google could not verify this account.',401);
    return this.completeIdentity(flow,payload.sub,this.email(payload.email),String(payload.name||payload.email).slice(0,100));
  }
  async completeIdentity(flow:Row,subject:string,email:string,name:string){
    if(typeof subject!=='string'||!subject||subject.length>255)throw new SiteError('Invalid Google identity.',401);
    const existing=await this.s.first('SELECT * FROM site_users WHERE google_subject=?',subject);
    if(flow.link_user) {
      const user=await this.requireUser(); if(user.id!==flow.link_user||user.email!==email||(existing&&existing.id!==user.id)) throw new SiteError('Use the Google account with the same email as your signed-in account.',409);
      const own=await this.s.first('SELECT google_subject FROM site_users WHERE id=?',user.id);
      if(own?.google_subject && own.google_subject!==subject) throw new SiteError('A different Google account is already linked.',409);
      await this.s.stmt('UPDATE site_users SET google_subject=? WHERE id=?',subject,user.id).run(); return this.issue(user.id);
    }
    if(existing) return this.issue(existing.id);
    // Google is authoritative for Gmail. Other addresses get one email proof
    // before first linking; later sign-ins use the already bound subject.
    if(!email.endsWith('@gmail.com')){
      const token=random();await this.s.stmt('INSERT INTO site_identity_links(token_hash,email,subject,expires_at) VALUES (?,?,?,?)',await digest(token),email,subject,new Date(this.s.clock().getTime()+10*60000).toISOString()).run();
      this.linkCookie=this.cookie('link',token,600);
      this.returnTo='/signin?mode=email&verify=google&email='+encodeURIComponent(email)+'&next='+encodeURIComponent(this.returnTo);
      return '';
    }
    await this.s.stmt('INSERT OR IGNORE INTO site_users(id,email,name,created_at) VALUES (?,?,?,?)',crypto.randomUUID(),email,name.slice(0,100),this.s.now()).run();
    const user=await this.s.first('UPDATE site_users SET google_subject=? WHERE email=? AND (google_subject IS NULL OR google_subject=?) RETURNING id',subject,email,subject);
    if(!user)throw new SiteError('A different Google account is already connected. Sign in with an email code.',409);
    return this.issue(user.id);
  }
}
