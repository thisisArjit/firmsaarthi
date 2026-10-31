import {AuthService,cookieToken} from './auth';
import {AppError} from './service';
import {digest,randomToken} from './passwords';
import type {BridgeEnv} from './sites-bridge';
import {currentOwnershipSql} from './account-ownership';
type Row=Record<string,any>;
export const sitesContinueCookie='__Host-fs_sites_continue';
export class SitesAccount {
  constructor(public env:BridgeEnv,public clock=()=>new Date()){}
  q(sql:string,...args:any[]){if(!this.env.DB)throw new AppError('Unavailable.',503);return this.env.DB.prepare(sql).bind(...args);}
  origin(){const u=new URL(this.env.SITES_ORIGIN||'');if(u.protocol!=='https:'||u.pathname!=='/'||u.search||u.hash||u.username||u.password)throw new AppError('Shared sign-in unavailable.',503);return u.origin;}
  configured(){if(this.env.FIRMSAARTHI_SSO_ENABLED!=='true'||!this.env.SITES_BRIDGE_SECRET||this.env.SITES_BRIDGE_SECRET.length<32)throw new AppError('Shared sign-in unavailable.',503);this.origin();}
  cookie(ticket:string,age=600){return `${sitesContinueCookie}=${ticket}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;}
  async start(state:unknown){this.configured();if(typeof state!=='string'||!/^([a-f0-9]{64})$/.test(state))throw new AppError('Invalid sign-in request.');
    await this.q("DELETE FROM sites_bridge_google WHERE phase LIKE 'account-%' AND expires_at<?",this.clock().toISOString()).run();
    const ticket=randomToken(),id='account_'+randomToken();
    await this.q("INSERT INTO sites_bridge_google(state,ticket_hash,site_state,nonce,verifier,phase,expires_at) VALUES (?,?,?,?,?,'account-ticket',?)",id,await digest(ticket),state,randomToken(),randomToken(),new Date(this.clock().getTime()+600000).toISOString()).run();
    return {url:new URL('/api/sites-bridge/account?ticket='+ticket,this.env.GOOGLE_REDIRECT_URI!).href};
  }
  async authorize(request:Request){this.configured();const ticket=new URL(request.url).searchParams.get('ticket')||'';
    if(!/^[a-f0-9]{64}$/.test(ticket))throw new AppError('Shared sign-in expired.',401);
    const pending=await this.q("SELECT state FROM sites_bridge_google WHERE ticket_hash=? AND phase='account-ticket' AND expires_at>?",await digest(ticket),this.clock().toISOString()).first();
    if(!pending)throw new AppError('Shared sign-in expired.',401);
    const user=await new AuthService(this.env.DB!).user(request.headers.get('cookie'));
    if(!user)return new Response(null,{status:303,headers:{Location:new URL('/',request.url).href,'Set-Cookie':this.cookie(ticket),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
    const account=await this.q('SELECT credential_version FROM password_accounts WHERE user_id=? AND disabled=0',user.userId).first<Row>();
    const owned=await this.q('SELECT a.user_id FROM password_accounts a WHERE a.user_id=? AND a.disabled=0 AND '+currentOwnershipSql(),user.userId).first();
    if(!owned)return new Response(null,{status:303,headers:{Location:new URL('/account/shared-access',request.url).href,'Set-Cookie':this.cookie(ticket),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
    const code=randomToken(),sourceSession=await digest(cookieToken(request.headers.get('cookie'))!);
    const flow=await this.q("UPDATE sites_bridge_google SET phase='account-complete',result_hash=?,subject=?,email=?,nonce=?,browser_hash=?,expires_at=? WHERE ticket_hash=? AND phase='account-ticket' AND expires_at>? RETURNING site_state",await digest(code),user.userId,user.email,account!.credential_version,sourceSession,new Date(this.clock().getTime()+60000).toISOString(),await digest(ticket),this.clock().toISOString()).first<Row>();
    if(!flow)throw new AppError('Shared sign-in expired.',401);
    return new Response(null,{status:303,headers:{Location:this.origin()+'/api/auth/firmsaarthi/callback?'+new URLSearchParams({state:flow.site_state,code}), 'Set-Cookie':this.cookie('',0),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  }
  async active(userId:unknown,version:unknown,sessionHash?:unknown){this.configured();if(typeof userId!=='string'||typeof version!=='string'||userId.length>255||version.length>255)return {active:false};
    const row=await this.q('SELECT a.user_id FROM password_accounts a JOIN memberships m ON m.user_id=a.user_id WHERE a.user_id=? AND a.credential_version=? AND a.disabled=0 AND '+currentOwnershipSql()+(sessionHash?' AND EXISTS(SELECT 1 FROM auth_sessions s WHERE s.user_id=a.user_id AND s.credential_version=a.credential_version AND s.token_hash=? AND s.expires_at>?)':''),userId,version,...(sessionHash?[sessionHash,Math.floor(this.clock().getTime()/1000)]:[])).first();return {active:!!row};
  }
  async exchange(state:unknown,code:unknown){this.configured();if(typeof state!=='string'||!/^[a-f0-9]{64}$/.test(state)||typeof code!=='string'||!/^[a-f0-9]{64}$/.test(code))throw new AppError('Shared sign-in expired.',401);
    const flow=await this.q("DELETE FROM sites_bridge_google WHERE site_state=? AND result_hash=? AND phase='account-complete' AND expires_at>? RETURNING subject,email,nonce,browser_hash",state,await digest(code),this.clock().toISOString()).first<Row>();
    if(!flow||!(await this.active(flow.subject,flow.nonce,flow.browser_hash)).active)throw new AppError('Sign in to FirmSaarthi again.',401);
    return {issuer:new URL(this.env.GOOGLE_REDIRECT_URI!).origin,userId:flow.subject,email:flow.email,credentialVersion:flow.nonce,sessionHash:flow.browser_hash,ownershipVerified:true};
  }
}
export function pendingSitesContinuation(cookie:string|null){const ticket=(cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(sitesContinueCookie+'='))?.slice(sitesContinueCookie.length+1);return ticket&&/^[a-f0-9]{64}$/.test(ticket)?'/api/sites-bridge/account?ticket='+ticket:null;}
