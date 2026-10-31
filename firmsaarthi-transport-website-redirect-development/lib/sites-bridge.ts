import {AppError} from './service';
import {digest,randomToken} from './passwords';
import {authenticSignature,signedHmac,checkoutConfig,type CheckoutEnvironment} from './plan-checkout';
import {googleConfig,GoogleAuth} from './google-auth';
import {SitesAccount} from './sites-account';
type Row=Record<string,any>;
export type BridgeEnv=CheckoutEnvironment&{DB?:D1Database;SITES_BRIDGE_SECRET?:string;SITES_ORIGIN?:string;GOOGLE_CLIENT_ID?:string;GOOGLE_CLIENT_SECRET?:string;GOOGLE_REDIRECT_URI?:string;RESEND_API_KEY?:string;PASSWORD_RESET_FROM?:string;FIRMSAARTHI_SSO_ENABLED?:string};
export class SitesBridge {
  constructor(public env:BridgeEnv,public fetcher:typeof fetch=fetch,public clock=()=>new Date()){}
  q(sql:string,...args:any[]){if(!this.env.DB)throw new AppError('Unavailable.',503);return this.env.DB.prepare(sql).bind(...args);}
  now(){return this.clock().toISOString();}
  origin(){const u=new URL(this.env.SITES_ORIGIN||'');if(u.protocol!=='https:'||u.pathname!=='/'||u.search||u.hash)throw new AppError('Sites configuration unavailable.',503);return u.origin;}
  configured(){if(!this.env.SITES_BRIDGE_SECRET||this.env.SITES_BRIDGE_SECRET.length<32)throw new AppError('Sites integration unavailable.',503);this.origin();return this.env.SITES_BRIDGE_SECRET;}
  async authorize(request:Request,raw:string){
    const secret=this.configured(),timestamp=request.headers.get('x-fs-timestamp')||'',nonce=request.headers.get('x-fs-nonce')||'';
    if(!/^\d{13}$/.test(timestamp)||Math.abs(this.clock().getTime()-Number(timestamp))>60000||!/^[a-f0-9]{64}$/.test(nonce)||!await authenticSignature(secret,timestamp+'.'+nonce+'.'+raw,request.headers.get('x-fs-signature')))throw new AppError('Unauthorized.',401);
    try{await this.q('INSERT INTO sites_bridge_nonces(id,expires_at) VALUES (?,?)',nonce,new Date(this.clock().getTime()+120000).toISOString()).run();}catch{throw new AppError('Request already used.',409);}
    await this.q('DELETE FROM sites_bridge_nonces WHERE expires_at<?',this.now()).run();
  }
  async provider(path:string,body?:Row){const config=checkoutConfig(this.env);if(!config)throw new AppError('Payments unavailable.',503);const response=await this.fetcher('https://api.razorpay.com/v1/'+path,{method:body?'POST':'GET',signal:AbortSignal.timeout(15000),redirect:'manual',headers:{Authorization:'Basic '+btoa(config.keyId+':'+config.secret),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(!response.ok)throw new AppError('Payment confirmation pending. Please retry status before paying again.',502);return response.json() as Promise<Row>;}
  async payment(path:string,body?:Row){
    if(path==='orders'&&body){
      if(body.amount!==199900||body.currency!=='INR'||!/^[a-f0-9-]{36}$/.test(body.receipt)||body.notes?.product!=='sites-by-firmsaarthi'||!/^FS-[A-F0-9]{16}$/.test(body.notes?.request_id))throw new AppError('Invalid website payment.');
      await this.q('INSERT OR IGNORE INTO sites_bridge_orders(receipt,request_id,created_at) VALUES (?,?,?)',body.receipt,body.notes.request_id,this.now()).run();
      const existing=await this.q('SELECT * FROM sites_bridge_orders WHERE receipt=?',body.receipt).first<Row>();
      if(existing!.request_id!==body.notes.request_id)throw new AppError('Payment request mismatch.',409);
      if(existing!.provider_id)return this.provider('orders/'+existing!.provider_id);
      const result=await this.provider('orders',body);
      if(result.receipt!==body.receipt||result.amount!==199900||result.currency!=='INR'||!/^order_[A-Za-z0-9]+$/.test(result.id))throw new AppError('Invalid provider response.',502);
      await this.q('UPDATE sites_bridge_orders SET provider_id=? WHERE receipt=?',result.id,body.receipt).run();return result;
    }
    if(body)throw new AppError('Unsupported provider operation.');
    const receipt=/^orders\?receipt=([a-f0-9-]{36})&count=100$/.exec(path);
    if(receipt){if(!await this.q('SELECT receipt FROM sites_bridge_orders WHERE receipt=?',receipt[1]).first())throw new AppError('Website payment not found.',404);const result=await this.provider(path);for(const o of result.items||[])if(o.receipt===receipt[1]&&o.amount===199900&&o.currency==='INR')await this.q('UPDATE sites_bridge_orders SET provider_id=? WHERE receipt=? AND provider_id IS NULL',o.id,receipt[1]).run();return result;}
    const order=/^orders\/(order_[A-Za-z0-9]+)(\/payments)?$/.exec(path);
    if(order){if(!await this.q('SELECT receipt FROM sites_bridge_orders WHERE provider_id=?',order[1]).first())throw new AppError('Website payment not found.',404);return this.provider(path);}
    if(/^payments\/pay_[A-Za-z0-9]+$/.test(path)){const payment=await this.provider(path);if(!await this.q('SELECT receipt FROM sites_bridge_orders WHERE provider_id=?',payment.order_id||'').first())throw new AppError('Website payment not found.',404);if(payment.id)await this.q('UPDATE sites_bridge_orders SET payment_id=? WHERE provider_id=?',payment.id,payment.order_id).run();return payment;}
    throw new AppError('Unsupported provider operation.');
  }
  async action(data:Row):Promise<Row>{
    if(data.action==='account-start')return new SitesAccount(this.env,this.clock).start(data.state);
    if(data.action==='account-exchange')return new SitesAccount(this.env,this.clock).exchange(data.state,data.code);
    if(data.action==='account-active')return new SitesAccount(this.env,this.clock).active(data.userId,data.credentialVersion,data.sessionHash);
    if(data.action==='configuration'){const p=checkoutConfig(this.env);return {google:!!googleConfig(this.env),email:!!this.env.RESEND_API_KEY&&!!this.env.PASSWORD_RESET_FROM,payments:!!p,keyId:p?.keyId||null};}
    if(data.action==='payment')return this.payment(data.path,data.body);
    if(data.action==='verify-checkout'){const config=checkoutConfig(this.env);if(!config||!await this.q('SELECT receipt FROM sites_bridge_orders WHERE provider_id=?',data.orderId||'').first())throw new AppError('Website payment not found.',404);return {valid:await authenticSignature(config.secret,data.orderId+'|'+data.paymentId,data.signature)};}
    if(data.action==='mail'){
      if(!this.env.RESEND_API_KEY||!this.env.PASSWORD_RESET_FROM)throw new AppError('Email unavailable.',503);
      const m=data.mail;if(!m||typeof m.to!=='string'||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(m.to)||/[\r\n]/.test(m.to)||typeof m.subject!=='string'||m.subject.length>250||/[\r\n]/.test(m.subject)||typeof m.text!=='string'||m.text.length>25000||typeof m.id!=='string'||!/^[a-zA-Z0-9_-]{1,150}$/.test(m.id))throw new AppError('Invalid website email.');
      const res=await this.fetcher('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(12000),headers:{Authorization:'Bearer '+this.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'sites/'+m.id},body:JSON.stringify({from:`Sites by FirmSaarthi <${this.env.PASSWORD_RESET_FROM}>`,to:[m.to],reply_to:'firmsaarthi@gmail.com',subject:m.subject,text:m.text})});if(!res.ok)throw new AppError('Email delivery pending.',503);return res.json() as Promise<Row>;
    }
    if(data.action==='google-start'){
      if(!googleConfig(this.env)||!/^[a-f0-9]{64}$/.test(data.state))throw new AppError('Google sign-in unavailable.',503);
      const state='sites_'+randomToken(),ticket=randomToken(),nonce=randomToken(),verifier=randomToken();
      await this.q("INSERT INTO sites_bridge_google(state,ticket_hash,site_state,nonce,verifier,phase,expires_at) VALUES (?,?,?,?,?,'ticket',?)",state,await digest(ticket),data.state,nonce,verifier,new Date(this.clock().getTime()+600000).toISOString()).run();
      return {url:new URL('/api/sites-bridge/authorize?ticket='+ticket,this.env.GOOGLE_REDIRECT_URI!).href};
    }
    if(data.action==='google-exchange'){
      if(!/^[a-f0-9]{64}$/.test(data.ticket)||!/^[a-f0-9]{64}$/.test(data.state))throw new AppError('Google sign-in expired.',401);
      const row=await this.q("DELETE FROM sites_bridge_google WHERE result_hash=? AND site_state=? AND phase='complete' AND expires_at>? RETURNING subject,email",await digest(data.ticket),data.state,this.now()).first<Row>();if(!row)throw new AppError('Google sign-in expired.',401);return row;
    }
    throw new AppError('Unknown integration action.',404);
  }
  cookie(token:string,age=600){return `__Host-fs_sites_bridge=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;}
  browser(request:Request){return (request.headers.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('__Host-fs_sites_bridge='))?.slice('__Host-fs_sites_bridge='.length)||'';}
  async googleAuthorize(request:Request){
    this.configured();const ticket=new URL(request.url).searchParams.get('ticket')||'';if(!/^[a-f0-9]{64}$/.test(ticket))throw new AppError('Google sign-in expired.',401);
    const browser=randomToken(),flow=await this.q("UPDATE sites_bridge_google SET browser_hash=?,phase='authorizing' WHERE ticket_hash=? AND phase='ticket' AND expires_at>? RETURNING *",await digest(browser),await digest(ticket),this.now()).first<Row>();
    const config=googleConfig(this.env);if(!flow||!config)throw new AppError('Google sign-in expired.',401);
    const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(flow.verifier))),challenge=btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
    const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');url.search=new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirectUri,response_type:'code',scope:'openid email',state:flow.state,nonce:flow.nonce,code_challenge:challenge,code_challenge_method:'S256',prompt:'select_account'}).toString();
    return new Response(null,{status:303,headers:{Location:url.href,'Set-Cookie':this.cookie(browser),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  }
  async googleCallback(request:Request){
    const headers=new Headers({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','Set-Cookie':this.cookie('',0)});
    try{
      this.configured();const url=new URL(request.url),state=url.searchParams.get('state')||'',browser=this.browser(request);
      if(!/^sites_[a-f0-9]{64}$/.test(state)||!/^[a-f0-9]{64}$/.test(browser))throw new Error('Invalid flow');
      const flow=await this.q("UPDATE sites_bridge_google SET phase='verifying' WHERE state=? AND browser_hash=? AND phase='authorizing' AND expires_at>? RETURNING *",state,await digest(browser),this.now()).first<Row>(),config=googleConfig(this.env);
      if(!flow||!config||url.searchParams.has('error'))throw new Error('Cancelled');
      const identity=await new GoogleAuth(this.env.DB!,config).exchange(url.searchParams.get('code')||'',flow,this.fetcher),ticket=randomToken();
      await this.q("UPDATE sites_bridge_google SET phase='complete',result_hash=?,subject=?,email=?,expires_at=? WHERE state=?",await digest(ticket),identity.subject,identity.email,new Date(this.clock().getTime()+60000).toISOString(),state).run();
      headers.set('Location',this.origin()+'/api/auth/google/callback?'+new URLSearchParams({state:flow.site_state,ticket}).toString());
    }catch{headers.set('Location',this.origin()+'/signin?error='+encodeURIComponent('Google sign-in was cancelled or expired. Please try again.'));}
    return new Response(null,{status:303,headers});
  }
  async forwardWebhook(raw:string,signature:string|null){
    if(!this.env.SITES_BRIDGE_SECRET)return null;
    const body=JSON.parse(raw),payment=body.payload?.payment?.entity,refund=body.payload?.refund?.entity,dispute=body.payload?.dispute?.entity,orderId=payment?.order_id||body.payload?.order?.entity?.id,paymentId=payment?.id||refund?.payment_id||dispute?.payment_id;
    const row=orderId?await this.q('SELECT * FROM sites_bridge_orders WHERE provider_id=?',orderId).first<Row>():paymentId?await this.q('SELECT * FROM sites_bridge_orders WHERE payment_id=?',paymentId).first<Row>():null;
    if(!row)return null;
    const config=checkoutConfig(this.env);if(!config||!await authenticSignature(config.webhook,raw,signature))throw new AppError('Invalid webhook signature.');
    const response=await this.fetcher(this.origin()+'/api/webhooks/razorpay',{method:'POST',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json','x-razorpay-signature':await signedHmac(this.configured(),'webhook:'+raw)},body:raw});
    if(!response.ok)throw new AppError('Website payment notification pending.',503);return response.json();
  }
}
