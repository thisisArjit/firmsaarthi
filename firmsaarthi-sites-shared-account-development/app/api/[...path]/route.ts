import { env } from 'cloudflare:workers';
import { SiteService, type SiteEnv } from '@/lib/site-service';
import { SiteError } from '@/lib/site-domain';
import { SiteAuth } from '@/lib/site-auth';
import {mailConfigured} from '@/lib/shared-integrations';
import {FirmSaarthiAccount} from '@/lib/firmsaarthi-account';
import sharedRelease from '@/lib/shared-account-release.json';
import {relayEnabled,relayNext,relayResult} from '@/lib/staging-bridge-relay';
import {boundedJson,boundedForm,boundedBody} from '@/lib/request-body';
export const dynamic = 'force-dynamic';
async function handle(request: Request) {
  try {
    const url=new URL(request.url), p=url.pathname.slice(5).split('/'), method=request.method;
    const service=new SiteService(env as SiteEnv,request);
    const auth=new SiteAuth(service);
    if(method==='POST' && p[0]!=='webhooks') {
      const origin=request.headers.get('origin');
      if(p[0]!=='tasks' && origin!==url.origin) throw new SiteError('Please submit this form from the website.',403);
      if(Number(request.headers.get('content-length')||0)>6*1024*1024) throw new SiteError('The upload is too large.',413);
    }
    let result: unknown;
    if(p[0]==='staging-bridge'){
      if(!relayEnabled(service.env)||url.origin!==service.env.PUBLIC_URL)throw new SiteError('Route not found.',404);
      if(method==='GET'&&p[1]==='next')return Response.json({request:await relayNext(service.env)},{headers:{'Cache-Control':'no-store'}});
      if(method==='POST'&&p[1]==='result')return Response.json(await relayResult(service.env,await boundedJson(request,150000)),{headers:{'Cache-Control':'no-store'}});
      throw new SiteError('Route not found.',404);
    }
    if(method==='GET'&&p.join('/')==='shared-account-release')return Response.json({fingerprint:sharedRelease.fingerprint,environment:service.env.APP_ENV==='staging'?'staging':'production',sharedAccountEnabled:new FirmSaarthiAccount(auth).enabled()},{headers:{'Cache-Control':'no-store'}});
    if(p[0]==='auth') {
      if(method==='GET'&&p[1]==='firmsaarthi'&&p[2]==='start'){
        try{const flow=await new FirmSaarthiAccount(auth).start();return new Response(null,{status:303,headers:{Location:flow.url,'Set-Cookie':flow.cookie,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});}catch{return Response.redirect(url.origin+'/signin?error=Shared%20sign-in%20is%20unavailable.%20Please%20try%20again.',303);}
      }
      if(method==='GET'&&p[1]==='firmsaarthi'&&p[2]==='callback'){
        const h=new Headers({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});h.append('Set-Cookie',auth.cookie('account','',0));
        try{const result=await new FirmSaarthiAccount(auth).finish(url);h.append('Set-Cookie',result.cookie);h.set('Location',url.origin+result.location);}catch(e){h.set('Location',url.origin+'/signin?error='+encodeURIComponent(e instanceof SiteError?e.message:'Shared sign-in failed. Please start again.'));}
        return new Response(null,{status:303,headers:h});
      }
      if(method==='GET' && p[1]==='google' && p[2]==='start') {
        try { const flow=await auth.startGoogle(); return new Response(null,{status:303,headers:{Location:flow.url,'Set-Cookie':flow.cookie,'Cache-Control':'no-store'}}); }
        catch(e) { return Response.redirect(url.origin+'/signin?error='+encodeURIComponent(e instanceof SiteError?e.message:'Google sign-in is unavailable.'),303); }
      }
      if(method==='GET' && p[1]==='google' && p[2]==='callback') {
        const h=new Headers({'Cache-Control':'no-store'}); h.append('Set-Cookie',auth.cookie('google','',0));
        try { const cookie=await auth.finishGoogle(url); if(cookie)h.append('Set-Cookie',cookie); if(auth.linkCookie)h.append('Set-Cookie',auth.linkCookie); h.set('Location',url.origin+auth.returnTo); }
        catch(e) { h.set('Location',url.origin+'/signin?error='+encodeURIComponent(e instanceof SiteError?e.message:'Google sign-in failed. Please try again.')); }
        return new Response(null,{status:303,headers:h});
      }
      if(method!=='POST') throw new SiteError('Route not found.',404);
      const data=await boundedJson(request,8192); let cookie='';
      if(p[1]==='code') result=await auth.requestCode(data.email,data.purpose);
      else if(p[1]==='otp') cookie=await auth.verifyEmail(data);
      else if(p[1]==='login') cookie=await auth.login(data);
      else if(p[1]==='signup') cookie=await auth.signup(data);
      else if(p[1]==='reset') cookie=await auth.reset(data);
      else if(p[1]==='logout') cookie=await auth.logout();
      else throw new SiteError('Route not found.',404);
      if(cookie){const h=new Headers({'Set-Cookie':cookie,'Cache-Control':'no-store'});if(p[1]==='otp'&&auth.readCookie('account_review'))h.append('Set-Cookie',auth.cookie('account_review','',0));return Response.json({success:true},{headers:h});}
    }
    else if(method==='GET' && p[0]==='session') result={admin:service.admin(),user:await auth.user(),googleEnabled:auth.googleEnabled(),emailEnabled:mailConfigured(service.env),sharedAccountEnabled:new FirmSaarthiAccount(auth).enabled()};
    else if(method==='GET' && p[0]==='mine') result=await service.mine();
    else if(method==='GET' && p[0]==='tasks' && p[1]==='reminders') {
      // A public, argument-free trigger can only send server-determined due
      // notices. An hourly global claim and unique outbox keys prevent replay.
      const key='maintenance:'+service.now().slice(0,13);
      const claimed=await service.stmt('INSERT OR IGNORE INTO site_rate_limits(id,count,expires_at) VALUES (?,1,?) RETURNING id',key,new Date(Date.now()+2*3600000).toISOString()).all();
      if(claimed.results.length)await service.reminders();
      result={accepted:true};
    }
    else if(method==='GET' && p[0]==='availability') {
      await service.limit('availability',120);
      const slug=url.searchParams.get('slug')||'';
      const {RESERVED}=await import('@/lib/site-domain');
      result={available:/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/.test(slug)&&!RESERVED.has(slug)&&!await service.first('SELECT id FROM site_requests WHERE slug=?',slug)};
    }
    else if(method==='POST' && p[0]==='requests' && p.length===1) result=await service.submit(await boundedJson(request));
    else if(p[0]==='requests' && p[1]) {
      const id=p[1];
      if(method==='GET' && p.length===2) result=await service.detail(id);
      else if(method==='POST' && p[2]==='launch') {await boundedJson(request,2048);result=await service.launch(id);}
      else if(method==='POST' && p[2]==='assets' && p[3]==='remove') result=await service.removeAsset(id,(await boundedJson(request,4096)).assetId);
      else if(method==='POST' && p[2]==='assets') result=await service.upload(id,await boundedForm(request));
      else if(method==='POST' && p[2]==='order') {await boundedJson(request,2048);result=await service.order(id);}
      else if(method==='POST' && p[2]==='verify') result=await service.verify(id,await boundedJson(request,8192));
      else if(method==='POST' && p[2]==='reconcile') {await boundedJson(request,2048);result=await service.reconcile(id);}
      else if(method==='POST' && p[2]==='manage') result=await service.update(id,await boundedJson(request));
      else if(method==='POST' && p[2]==='update') result=await service.customerUpdate(id,await boundedJson(request));
      else throw new SiteError('Route not found.',404);
    }
    else if(method==='GET' && p[0]==='assets' && p[1]) return await service.asset(p[1]);
    else if(method==='GET' && p[0]==='admin') result=await service.adminList();
    else if(method==='POST' && p[0]==='admin' && p[1]==='emails') { await boundedJson(request,2048);service.requireAdmin(); result=await service.flush(); }
    else if(method==='POST' && p[0]==='tasks' && p[1]==='reminders') {
      await boundedJson(request,2048);
      if(!service.admin() && (!service.env.AUTOMATION_SECRET || request.headers.get('authorization')!=='Bearer '+service.env.AUTOMATION_SECRET)) throw new SiteError('Unauthorized.',401);
      result=await service.reminders();
    }
    else if(method==='POST' && p[0]==='webhooks' && p[1]==='razorpay') result=await service.webhook(new TextDecoder().decode(await boundedBody(request,65536)),request.headers.get('x-razorpay-signature'));
    else throw new SiteError('Route not found.',404);
    return Response.json(result,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  } catch(e) {
    if(e instanceof SiteError) return Response.json({error:e.message},{status:e.status,headers:{'Cache-Control':'no-store'}});
    return Response.json({error:'The service could not complete this request. Please try again or contact firmsaarthi@gmail.com.'},{status:500,headers:{'Cache-Control':'no-store'}});
  }
}
export const GET=handle;
export const POST=handle;
