import {test,vi} from 'vitest';
import assert from 'node:assert/strict';
import {apiFixture} from './helpers/api';
import * as route from '../app/api/auth/signup-email/route';
import {AuthService} from '../lib/auth';
import {signupCookie,signupCookieName,signupReadyCookieName,signupSession} from '../lib/signup-email-proof';
import {sendSignupEmail} from '../lib/signup-email';
import {randomToken} from '../lib/passwords';
const origin='https://local.test',password='Synthetic passphrase 2026',name='Synthetic signup route';
function jar(cookie:string,response:Response){let values=cookie.split(';').map(v=>v.trim()).filter(Boolean);for(const set of response.headers.getSetCookie()){const value=set.split(';')[0],name=value.split('=')[0];values=values.filter(v=>!v.startsWith(name+'='));if(!set.includes('Max-Age=0'))values.push(value);}return values.join('; ');}
async function fixture(){const f=await apiFixture(),mail:any[]=[];Object.assign(f.env,{RESEND_API_KEY:'re_synthetic_test_key',PASSWORD_RESET_FROM:'no-reply@synthetic.test',PASSWORD_RESET_REPLY_TO:'support@synthetic.test',PASSWORD_RESET_SECRET:'ab'.repeat(32)});vi.stubGlobal('fetch',async(_url:any,init:any)=>{mail.push(JSON.parse(init.body));return Response.json({id:'synthetic-mail'});});return {...f,mail};}
async function ready(f:Awaited<ReturnType<typeof fixture>>,email='signup@synthetic.test'){
 const start=await f.request('/api/auth/signup-email',{action:'request',email},{cookie:''});assert.equal(start.status,200);let cookie=jar('',start);const code=f.mail.at(-1).text.match(/code is (\d{6})/)[1],verify=await f.request('/api/auth/signup-email',{action:'verify',code},{cookie});assert.equal(verify.status,200);cookie=jar(cookie,verify);return cookie;
}
test('signup HTTP confirms mail before creating an isolated owner and keeps all capabilities out of JSON',async()=>{
 const f=await fixture();try{
  const initial=await route.GET(new Request(origin+'/api/auth/signup-email'));assert.deepEqual(await initial.json(),{enabled:true,step:'email'});
  const start=await f.request('/api/auth/signup-email',{action:'request',email:'signup@synthetic.test'},{cookie:''}),body=await start.json() as any;assert.equal(start.status,200);for(const key of ['proof','requestId','code','registrationToken'])assert.equal(body[key],undefined);assert.equal(start.headers.get('Cache-Control'),'no-store');assert.equal(start.headers.get('Referrer-Policy'),'no-referrer');
  let cookie=jar('',start);assert.ok(start.headers.getSetCookie().every((v:string)=>v.includes('HttpOnly')&&v.includes('SameSite=Strict')));assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM password_accounts').get()!.n,1);
  const progress=await f.request('/api/auth/signup-email',undefined,{cookie});const p=await progress.json() as any;assert.equal(p.step,'code');assert.equal(p.email,'signup@synthetic.test');assert.equal(p.proof,undefined);
  const code=f.mail[0].text.match(/code is (\d{6})/)[1],verified=await f.request('/api/auth/signup-email',{action:'verify',code},{cookie});assert.deepEqual(await verified.json(),{step:'details'});cookie=jar(cookie,verified);
  assert.equal((await(await f.request('/api/auth/signup-email',undefined,{cookie})).json() as any).step,'details');
  const completed=await f.request('/api/auth/signup-email',{action:'complete',password,businessName:name,role:'PLATFORM_ADMIN',orgId:'other-organization',email:'other@synthetic.test'},{cookie});assert.equal(completed.status,200);assert.equal(completed.headers.getSetCookie().length,3);assert.deepEqual(await completed.json(),{success:true,alreadyCreated:false});
  const finalCookie=jar(cookie,completed),auth=new AuthService(f.db),user=await auth.user(finalCookie);assert.equal(user!.email,'signup@synthetic.test');assert.equal(signupSession(finalCookie),null);
  assert.equal(f.sqlite.prepare('SELECT role FROM memberships WHERE user_id=?').get(user!.userId)!.role,'OWNER');assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM organizations').get()!.n,2);assert.equal((await f.request('/api/billing?view=users',undefined,{cookie:finalCookie})).status,403);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM google_identities').get()!.n,0);
 }finally{vi.unstubAllGlobals();f.sqlite.close();}
});
test('lost completion response recovers the same account without replaying a different payload',async()=>{
 const f=await fixture();try{
  const cookie=await ready(f),body={action:'complete',password,businessName:name};const lost=await f.request('/api/auth/signup-email',body,{cookie});assert.equal(lost.status,200);
  const recovered=await f.request('/api/auth/signup-email',body,{cookie});assert.equal(recovered.status,200);assert.equal((await recovered.json() as any).alreadyCreated,true);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM password_accounts').get()!.n,2);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit WHERE action='account.verified-signup'").get()!.n,1);
  assert.equal((await f.request('/api/auth/signup-email',{...body,businessName:'Different'},{cookie})).status,409);
  const ownSession=jar(cookie,lost)+'; '+cookie;assert.equal((await f.request('/api/auth/signup-email',body,{cookie:ownSession})).status,200);
 }finally{vi.unstubAllGlobals();f.sqlite.close();}
});
test('a different authenticated account cannot consume a verified signup or create another workspace',async()=>{
 const f=await fixture();try{const cookie=await ready(f);assert.equal((await f.request('/api/auth/signup-email',{action:'complete',password,businessName:name},{cookie:f.getCookie()+'; '+cookie})).status,409);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM organizations').get()!.n,1);assert.equal((await f.request('/api/auth/signup-email',{action:'request',email:'other@synthetic.test'})).status,409);}finally{vi.unstubAllGlobals();f.sqlite.close();}
});
test('origin, support, malformed/oversize body and old direct-signup bypass are denied',async()=>{
 const f=await fixture();try{
  const body={action:'request',email:'signup@synthetic.test'};assert.equal((await f.request('/api/auth/signup-email',body,{cookie:'',origin:'https://evil.test'})).status,403);assert.equal((await f.request('/api/auth/signup-email',body,{cookie:'logistrace_support=synthetic'})).status,403);
  assert.equal((await f.request('/api/auth/signup-email',{padding:'x'.repeat(5000)},{cookie:''})).status,413);assert.equal((await route.POST(new Request(origin+'/api/auth/signup-email',{method:'POST',headers:{Origin:origin},body:'null'}))).status,400);
  assert.equal((await f.request('/api/auth',{action:'signup',email:'signup@synthetic.test',password:'Eight123',businessName:name},{cookie:''})).status,409);assert.equal(f.mail.length,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM signup_email_proofs').get()!.n,0);
 }finally{vi.unstubAllGlobals();f.sqlite.close();}
});
test('missing/cross-purpose cookies, unavailable config and explicit cancellation cannot grant access',async()=>{
 const f=await fixture();try{
  assert.equal((await f.request('/api/auth/signup-email',{action:'verify',code:'123456'},{cookie:'tms_reset='+randomToken()})).status,400);assert.equal((await f.request('/api/auth/signup-email',{action:'complete',password,businessName:name},{cookie:''})).status,400);
  const cookie=await ready(f);const cancel=await f.request('/api/auth/signup-email',{action:'cancel'},{cookie});assert.equal(cancel.status,200);assert.equal(cancel.headers.getSetCookie().length,2);assert.equal((await(await f.request('/api/auth/signup-email',undefined,{cookie:jar(cookie,cancel)})).json() as any).step,'email');
  delete f.env.RESEND_API_KEY;assert.equal((await(await route.GET(new Request(origin+'/api/auth/signup-email'))).json() as any).enabled,false);assert.equal((await f.request('/api/auth/signup-email',{action:'request',email:'new@synthetic.test'},{cookie:''})).status,503);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM password_accounts').get()!.n,1);
 }finally{vi.unstubAllGlobals();f.sqlite.close();}
});
test('mail adapter fixes endpoint/timeout/idempotency and bounds provider responses without exposing errors',async()=>{
 const config={apiKey:'re_synthetic_test_key',from:'no-reply@synthetic.test',replyTo:'support@synthetic.test',secret:'ab'.repeat(32)},mail={to:'signup@synthetic.test',code:'123456',requestId:'cd'.repeat(32)};let observed:any;
 await sendSignupEmail(config,mail,async(url,init)=>{observed={url,init};return Response.json({id:'synthetic'});});assert.equal(observed.url,'https://api.resend.com/emails');assert.equal(observed.init.redirect,'manual');assert.equal(observed.init.headers['Idempotency-Key'],'signup-email/'+mail.requestId);assert.equal(JSON.parse(observed.init.body).reply_to,config.replyTo);assert.ok(observed.init.signal);
 for(const response of [new Response(null,{status:302,headers:{Location:'https://evil.test'}}),new Response('x'.repeat(5000)),Response.json({})])await assert.rejects(sendSignupEmail(config,mail,async()=>response),/^Error: Email delivery unavailable/);
});
test('production signup cookies are host-only secure and bind the ready capability to its original request',()=>{
 vi.stubEnv('NODE_ENV','production');try{const id=randomToken(),proof=randomToken(),ready=randomToken(),cookie=signupCookie(signupCookieName(),id+'.'+proof,600),verified=signupCookie(signupReadyCookieName(),id+'.'+ready,300);assert.ok(cookie.startsWith('__Host-'));assert.ok(cookie.includes('; Secure'));assert.ok(!cookie.includes('Domain='));assert.equal(signupSession(cookie+'; '+verified)!.registrationToken,ready);assert.equal(signupSession(cookie+'; '+signupCookie(signupReadyCookieName(),randomToken()+'.'+ready,300))!.registrationToken,null);}finally{vi.unstubAllEnvs();}
});
