import type {SiteAuth} from './site-auth';
import {digest,SiteError} from './site-domain';
import {sharedCall,sharedEnabled} from './shared-integrations';
type Principal={issuer:string;userId:string;email:string;credentialVersion:string;sessionHash:string;ownershipVerified:true};
const token=()=>crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
export class FirmSaarthiAccount {
  constructor(public auth:SiteAuth){}
  get s(){return this.auth.s;}
  enabled(){return this.s.env.FIRMSAARTHI_SSO_ENABLED==='true'&&sharedEnabled(this.s.env);}
  requireEnabled(){if(!this.enabled())throw new SiteError('Shared FirmSaarthi sign-in is not available yet.',503);}
  async active(p:Pick<Principal,'userId'|'credentialVersion'>,sessionHash?:string){this.requireEnabled();const r=await sharedCall(this.s.env,{action:'account-active',userId:p.userId,credentialVersion:p.credentialVersion,...(sessionHash?{sessionHash}:{})},this.s.transport);if(r.active!==true)throw new SiteError('Sign in with your FirmSaarthi account again.',401);}
  async start(){this.requireEnabled();await this.s.limit('shared-account',30);await this.s.db.batch([this.s.stmt('DELETE FROM site_account_flows WHERE expires_at<?',this.s.now()),this.s.stmt('DELETE FROM site_account_reviews WHERE expires_at<?',this.s.now())]);const state=token(),browser=token();
    await this.s.stmt('INSERT INTO site_account_flows(state_hash,browser_hash,expires_at) VALUES (?,?,?)',await digest(state),await digest(browser),new Date(this.s.clock().getTime()+600000).toISOString()).run();
    const r=await sharedCall(this.s.env,{action:'account-start',state},this.s.transport);const u=new URL(r.url);if(u.origin!==new URL(this.s.env.SHARED_INTEGRATIONS_URL!).origin||u.pathname!=='/api/sites-bridge/account')throw new SiteError('Invalid shared sign-in response.',503);
    return {url:u.href,cookie:this.auth.cookie('account',browser,600)};
  }
  async finish(url:URL){this.requireEnabled();const state=url.searchParams.get('state')||'',code=url.searchParams.get('code')||'',browser=this.auth.readCookie('account');
    if(!/^[a-f0-9]{64}$/.test(state)||!/^[a-f0-9]{64}$/.test(code)||!/^[a-f0-9]{64}$/.test(browser))throw new SiteError('Shared sign-in expired.',401);
    const flow=await this.s.first('DELETE FROM site_account_flows WHERE state_hash=? AND browser_hash=? AND expires_at>? RETURNING state_hash',await digest(state),await digest(browser),this.s.now());if(!flow)throw new SiteError('Shared sign-in expired.',401);
    const p=await sharedCall(this.s.env,{action:'account-exchange',state,code},this.s.transport) as Principal;
    if(p.ownershipVerified!==true||p.issuer!==new URL(this.s.env.SHARED_INTEGRATIONS_URL!).origin||typeof p.userId!=='string'||!p.userId||p.userId.length>255||typeof p.credentialVersion!=='string'||!p.credentialVersion||p.credentialVersion.length>255||typeof p.sessionHash!=='string'||!/^[a-f0-9]{64}$/.test(p.sessionHash))throw new SiteError('Invalid shared account.',401);
    p.email=this.auth.email(p.email);await this.active(p,p.sessionHash);
    const mapped=await this.s.first('SELECT l.*,u.email FROM site_firmsaarthi_links l JOIN site_users u ON u.id=l.user_id WHERE l.transport_user_id=?',p.userId),current=await this.auth.user();
    if(current&&((mapped&&mapped.user_id!==current.id)||(!mapped&&current.email!==p.email)))throw new SiteError('A different Sites account is open. Sign out before switching accounts.',409);
    if(mapped){if(mapped.email!==p.email)throw new SiteError('Your account email changed. Contact FirmSaarthi to review the existing account link.',409);
      await this.s.stmt('UPDATE site_firmsaarthi_links SET credential_version=? WHERE transport_user_id=? AND user_id=?',p.credentialVersion,p.userId,mapped.user_id).run();return {cookie:await this.auth.issue(mapped.user_id,p.sessionHash),location:'/account'};
    }
    // Transport legacy email/password ownership is not proof of this mailbox.
    // First binding always requires the normal Sites mailbox OTP and consent.
    const review=token();await this.s.stmt('INSERT INTO site_account_reviews(token_hash,principal,expires_at) VALUES (?,?,?)',await digest(review),JSON.stringify(p),new Date(this.s.clock().getTime()+600000).toISOString()).run();
    return {cookie:this.auth.cookie('account_review',review,600),location:'/signin?mode=email&verify=firmsaarthi&email='+encodeURIComponent(p.email)};
  }
  async review(){this.requireEnabled();const value=this.auth.readCookie('account_review');if(!/^[a-f0-9]{64}$/.test(value))throw new SiteError('Restart shared FirmSaarthi sign-in.',401);const row=await this.s.first('SELECT principal FROM site_account_reviews WHERE token_hash=? AND expires_at>?',await digest(value),this.s.now());if(!row)throw new SiteError('Restart shared FirmSaarthi sign-in.',401);return {hash:await digest(value),p:JSON.parse(row.principal) as Principal};}
  async bindEmail(userId:string,email:string,confirmed:unknown){if(confirmed!==true)throw new SiteError('Confirm linking this account and signing out earlier Sites sessions.');const {hash,p}=await this.review();if(p.email!==email)throw new SiteError('Verify the email shown by your FirmSaarthi account.',409);await this.active(p,p.sessionHash);
    const mapping='EXISTS(SELECT 1 FROM site_firmsaarthi_links WHERE transport_user_id=? AND user_id=?)',review='EXISTS(SELECT 1 FROM site_account_reviews WHERE token_hash=? AND expires_at>?)';
    const result=await this.s.db.batch([
      this.s.stmt('INSERT INTO site_firmsaarthi_links(transport_user_id,user_id,credential_version) SELECT ?,?,? WHERE '+review+' ON CONFLICT(transport_user_id) DO NOTHING',p.userId,userId,p.credentialVersion,hash,this.s.now()),
      this.s.stmt('DELETE FROM site_federated_sessions WHERE user_id=? AND '+mapping+' AND '+review,userId,p.userId,userId,hash,this.s.now()),
      this.s.stmt('DELETE FROM site_sessions WHERE user_id=? AND '+mapping+' AND '+review,userId,p.userId,userId,hash,this.s.now()),
      this.s.stmt('DELETE FROM site_account_reviews WHERE token_hash=? AND '+mapping+' RETURNING token_hash',hash,p.userId,userId),
    ]);
    if(result[3].results?.length!==1)throw new SiteError('This account link could not be confirmed. Restart shared sign-in.',409);return p;
  }
  async session(userId:string,sessionHash:string){if(!this.enabled())return;const link=await this.s.first('SELECT * FROM site_firmsaarthi_links WHERE user_id=?',userId);if(!link)return;
    const session=await this.s.first('SELECT * FROM site_federated_sessions WHERE token_hash=? AND user_id=?',sessionHash,userId);if(!session)return;
    await this.active({userId:link.transport_user_id,credentialVersion:session.credential_version},session.source_session_hash||undefined);
  }
  async attach(userId:string,sessionHash:string,sourceSessionHash?:string){if(!this.enabled()||!sourceSessionHash)return;const link=await this.s.first('SELECT * FROM site_firmsaarthi_links WHERE user_id=?',userId);if(!link)return;
    await this.active({userId:link.transport_user_id,credentialVersion:link.credential_version},sourceSessionHash);
    await this.s.stmt('INSERT INTO site_federated_sessions(token_hash,user_id,credential_version,source_session_hash) VALUES (?,?,?,?)',sessionHash,userId,link.credential_version,sourceSessionHash||null).run();
  }
}
