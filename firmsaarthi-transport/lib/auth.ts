import { AppError, type Identity } from './service';
import { digest, randomToken, hashPassword, verifyPassword, upgradePassword, validatePassword } from './passwords';
import type { Row } from './domain';

const TTL=7*24*60*60;
const now=()=>Math.floor(Date.now()/1000);
export const cookieName=()=>process.env.NODE_ENV==='production'?'__Host-tms_session':'tms_session';
export function sessionCookie(token: string,age=TTL) {return `${cookieName()}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${process.env.NODE_ENV==='production'?'; Secure':''}`;}
export function cookieToken(cookie: string|null) {const value=(cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(`${cookieName()}=`))?.slice(cookieName().length+1);return value&&/^[a-f0-9]{64}$/.test(value)?value:null;}
export function sameOrigin(request: Request) {if(request.headers.get('origin')!==new URL(request.url).origin)throw new AppError('Cross-origin writes are blocked.',403);}
export class AuthService {
  constructor(public db:D1Database){}
  q(sql:string,...args:any[]){return this.db.prepare(sql).bind(...args);}
  async signup(email:unknown,password:unknown,name:unknown,ip:string){
    const normalized=normalizeEmail(email);validatePassword(password);const business=businessName(name);
    await this.limit(`signup:${normalized}`,ip);
    const userId=crypto.randomUUID(),orgId=crypto.randomUUID(),version=crypto.randomUUID(),at=new Date().toISOString(),hash=await hashPassword(password);
    try{await this.db.batch([
      this.q('INSERT INTO organizations (id,owner_id,name,profile,created_at) VALUES (?,?,?,?,?)',orgId,userId,business,JSON.stringify({transportName:business}),at),
      this.q('INSERT INTO password_accounts VALUES (?,?,?,?,0,?)',userId,normalized,hash,version,at),
      this.q('INSERT INTO memberships VALUES (?,?,?,?,?)',userId,orgId,normalized,'OWNER',at),
      this.q('INSERT INTO audit VALUES (?,?,?,?,?,?)',crypto.randomUUID(),orgId,userId,'account.signup',userId,at),
    ]);}catch{throw new AppError('Unable to create an account. Try signing in or contact your workspace owner.',409);}
    return this.issue(userId,version);
  }
  async user(cookie:string|null):Promise<Identity|null>{
    const token=cookieToken(cookie);if(!token)return null;
    const row=await this.q('SELECT a.user_id,a.email FROM auth_sessions s JOIN password_accounts a ON a.user_id=s.user_id AND a.credential_version=s.credential_version JOIN memberships m ON m.user_id=a.user_id WHERE s.token_hash=? AND s.expires_at>? AND a.disabled=0',await digest(token),now()).first<Row>();
    return row?{userId:row.user_id,email:row.email}:null;
  }
  async limit(email:string,ip:string){
    const bucket=Math.floor(now()/900);const keys=[`email:${await digest(email)}:${bucket}`,`ip:${await digest(ip)}:${bucket}`];
    const counts=await this.db.batch(keys.map(key=>this.q('INSERT INTO auth_limits (key,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts',key,(bucket+2)*900)));
    if(Number((counts[0].results[0] as Row)?.attempts)>5||Number((counts[1].results[0] as Row)?.attempts)>50)throw new AppError('Too many login attempts. Please try again in 15 minutes.',429);
    return keys[0];
  }
  async issue(userId:string,version:string){
    const token=randomToken();const result=await this.q('INSERT INTO auth_sessions (token_hash,user_id,credential_version,expires_at) SELECT ?,a.user_id,a.credential_version,? FROM password_accounts a JOIN memberships m ON m.user_id=a.user_id WHERE a.user_id=? AND a.credential_version=? AND a.disabled=0',await digest(token),now()+TTL,userId,version).run();
    if(result.meta.changes!==1)throw new AppError('Sign in again.',401);
    await this.db.batch([this.q('DELETE FROM auth_sessions WHERE expires_at<=?',now()),this.q('DELETE FROM auth_limits WHERE expires_at<=?',now())]);
    return token;
  }
  async login(email:unknown,password:unknown,ip:string){
    if(typeof email!=='string'||email.length>254||typeof password!=='string'||password.length>1024)throw new AppError('Email or password is incorrect.',401);
    const normalized=email.trim().toLowerCase();const limitKey=await this.limit(normalized,ip);
    const row=await this.q('SELECT a.* FROM password_accounts a JOIN memberships m ON m.user_id=a.user_id WHERE a.email=? AND a.disabled=0',normalized).first<Row>();
    // Perform the expensive hash even for unknown accounts; responses never reveal account existence.
    const dummy='scrypt$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000';
    const stored=row?.password_hash;const valid=await verifyPassword(password,stored&&!stored.startsWith('google-only$')?stored:dummy);
    if(!row||!valid)throw new AppError('Email or password is incorrect.',401);
    let version=row.credential_version;
    if(row.password_hash.startsWith('legacy-sha256$')){
      version=crypto.randomUUID();const hash=await upgradePassword(password);
      const updated=await this.q('UPDATE password_accounts SET password_hash=?,credential_version=?,updated_at=? WHERE user_id=? AND credential_version=? AND disabled=0',hash,version,new Date().toISOString(),row.user_id,row.credential_version).run();
      if(updated.meta.changes!==1)throw new AppError('Sign in again.',401);
    }
    const token=await this.issue(row.user_id,version);await this.q('DELETE FROM auth_limits WHERE key=?',limitKey).run();return token;
  }
  async logout(cookie:string|null){const token=cookieToken(cookie);if(token)await this.q('DELETE FROM auth_sessions WHERE token_hash=?',await digest(token)).run();}
  async changePassword(user:Identity,current:unknown,password:unknown,ip:string){
    validatePassword(password);await this.limit(`change:${user.userId}`,ip);
    const account=await this.q('SELECT * FROM password_accounts WHERE user_id=? AND disabled=0',user.userId).first<Row>();
    if(!account||!await verifyPassword(current,account.password_hash))throw new AppError('Current password is incorrect.',401);
    const version=crypto.randomUUID(),hash=await hashPassword(password);
    const updated=await this.q('UPDATE password_accounts SET password_hash=?,credential_version=?,updated_at=? WHERE user_id=? AND credential_version=? AND disabled=0',hash,version,new Date().toISOString(),user.userId,account.credential_version).run();
    if(updated.meta.changes!==1)throw new AppError('Your password changed. Sign in again.',401);
    await this.q('DELETE FROM auth_sessions WHERE user_id=?',user.userId).run();return this.issue(user.userId,version);
  }
}

export function normalizeEmail(value:unknown){
  if(typeof value!=='string'||value.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))throw new AppError('Enter a valid email address.');
  return value.trim().toLowerCase();
}
export function businessName(value:unknown){if(typeof value!=='string'||!value.trim()||value.trim().length>150)throw new AppError('Enter a business name of up to 150 characters.');return value.trim();}
