import {finishSyntheticGoogleClaim,claimedPassword} from './helpers/google-claim';
import {GoogleAccountClaimRequired} from '../lib/google-account-claim';
import {claimCookieName,claimSession} from '../lib/google-account-claim';
import {test,vi} from 'vitest';
import assert from 'node:assert/strict';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {database} from './helpers/database';
import {GoogleAuth,verifyGoogleToken} from '../lib/google-auth';
import {AuthService,cookieName} from '../lib/auth';
import {TransportService} from '../lib/service';
import {apiFixture} from './helpers/api';
import * as googleStart from '../app/api/auth/google/start/route';
import * as googleCallback from '../app/api/auth/google/callback/route';

const config={clientId:'synthetic-dual-login',clientSecret:'synthetic-secret',redirectUri:'https://local.test/api/auth/google/callback'},password='Synthetic unchanged password 123!';

test('unlinked callback creates only a browser-bound review and cannot silently reset, mail, link or sign in',async()=>{
 const f=await apiFixture(),auth=new AuthService(f.db);let exchange:ReturnType<typeof vi.spyOn>|undefined;
 try{
  await auth.signup('unlinked.synthetic@gmail.com',password,'Synthetic unlinked workspace','seed');
  Object.assign(f.env,{GOOGLE_CLIENT_ID:config.clientId,GOOGLE_CLIENT_SECRET:config.clientSecret,GOOGLE_REDIRECT_URI:config.redirectUri,RESEND_API_KEY:'re_synthetic_test_key',PASSWORD_RESET_FROM:'no-reply@synthetic.test',PASSWORD_RESET_REPLY_TO:'support@synthetic.test',PASSWORD_RESET_SECRET:'ab'.repeat(32)});
  const before=f.sqlite.prepare('SELECT * FROM password_accounts ORDER BY user_id').all(),sessions=f.sqlite.prepare('SELECT * FROM auth_sessions ORDER BY token_hash').all(),fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  const start=await googleStart.POST(new Request('https://local.test/api/auth/google/start',{method:'POST',headers:{Origin:'https://local.test','Content-Type':'application/json'},body:JSON.stringify({intent:'signup',businessKind:'supplier',businessName:'Synthetic new workspace request'})}));assert.equal(start.status,200);const url=new URL(((await start.json()) as {url:string}).url),browser=start.headers.getSetCookie()[0].split(';')[0];
  exchange=vi.spyOn(GoogleAuth.prototype,'exchange').mockResolvedValue({subject:'synthetic-unlinked-sub',email:'unlinked.synthetic@gmail.com'});
  const callback=await googleCallback.GET(new Request('https://local.test/api/auth/google/callback?state='+url.searchParams.get('state')+'&code=synthetic-verified-code',{headers:{Cookie:browser}}));
  assert.equal(callback.status,303);assert.equal(callback.headers.get('Location'),'https://local.test/account/claim');
  const claim=callback.headers.getSetCookie().find(c=>c.startsWith(claimCookieName()+'='))!;assert.ok(claimSession(claim));assert.ok(claim.includes('HttpOnly'));assert.ok(claim.includes('SameSite=Strict'));assert.ok(!callback.headers.getSetCookie().some(c=>c.startsWith(cookieName()+'=')));
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM password_accounts ORDER BY user_id').all(),before);assert.deepEqual(f.sqlite.prepare('SELECT * FROM auth_sessions ORDER BY token_hash').all(),sessions);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM google_identities').get()!.n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM google_account_claims').get()!.n,1);assert.equal(fetch.mock.calls.length,0);
 }finally{exchange?.mockRestore();vi.unstubAllGlobals();f.sqlite.close();}
});
async function fixture(email='dual.synthetic@gmail.com'){
 const {db,sqlite}=database(),auth=new AuthService(db),google=new GoogleAuth(db,config),token=await auth.signup(email,password,'Synthetic existing business','dual-ip'),user=(await auth.user(cookieName()+'='+token))!,service=new TransportService(db,user);
 await service.command('consignment.save',{year:'2026-2027',cn:'DUAL-KEEP',date:'2026-10-27',company:'Synthetic existing customer',truck:'BR01AB1234',origin:'Patna',destination:'Delhi',freight:'1000',advance:'0'});
 return {db,sqlite,auth,google,user,service};
}
for(const role of ['OWNER','MEMBER','DISPATCHER'])test(`verified Gmail claims the same ${role} account only after mailbox proof and explicit fresh credentials; history and permissions stay intact`,async()=>{
 const f=await fixture();try{
  const account=f.sqlite.prepare('SELECT * FROM password_accounts').get()!,org=(await f.service.member()).org_id;
  f.sqlite.prepare('UPDATE memberships SET role=? WHERE user_id=?').run(role,f.user.userId);
  await assert.rejects(()=>f.google.complete({intent:'signup'},{subject:'verified-gmail-sub',email:'dual.synthetic@gmail.com'},null),GoogleAccountClaimRequired);assert.equal(f.sqlite.prepare('SELECT password_hash FROM password_accounts').get()!.password_hash,account.password_hash);
  const token=await finishSyntheticGoogleClaim(f.google,{intent:'signup',business_name:'Must not replace existing business'},{subject:'verified-gmail-sub',email:'dual.synthetic@gmail.com'},null);
  assert.equal((await f.auth.user(cookieName()+'='+token))!.userId,f.user.userId);
  const passwordToken=await f.auth.login('dual.synthetic@gmail.com',claimedPassword,'dual-password-ip');assert.equal((await f.auth.user(cookieName()+'='+passwordToken))!.userId,f.user.userId);
  const saved=f.sqlite.prepare('SELECT * FROM password_accounts').get()!;assert.notEqual(saved.password_hash,account.password_hash);assert.notEqual(saved.credential_version,account.credential_version);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM organizations').get()!.n,1);assert.equal(f.sqlite.prepare('SELECT name FROM organizations WHERE id=?').get(org)!.name,'Synthetic existing business');
  assert.equal((await f.service.member()).role,role);assert.equal((await f.service.member()).org_id,org);assert.equal(f.sqlite.prepare('SELECT cn FROM consignments').get()!.cn,'DUAL-KEEP');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit WHERE action='account.google.email-claim'").get()!.n,1);
  const again=await f.google.complete({intent:'login'},{subject:'verified-gmail-sub',email:'renamed@gmail.com'},null);assert.equal((await f.auth.user(cookieName()+'='+again))!.userId,f.user.userId);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM google_identities').get()!.n,1);
 }finally{f.sqlite.close();}
});

test('verified Google token/hosted-domain claims still cannot link an existing account without current mailbox proof and explicit consent',async()=>{
 const pair=await generateKeyPair('RS256'),jwk=await exportJWK(pair.publicKey),key=createLocalJWKSet({keys:[{...jwk,kid:'dual-key',alg:'RS256'}]}),now=Math.floor(Date.now()/1000);
 const sign=(extra:Record<string,unknown>={})=>new SignJWT({iss:'https://accounts.google.com',aud:config.clientId,sub:'workspace-sub',email:'Owner@Synthetic.Example',email_verified:true,nonce:'dual-nonce',iat:now,exp:now+300,...extra}).setProtectedHeader({alg:'RS256',kid:'dual-key'}).sign(pair.privateKey);
 const f=await fixture('owner@synthetic.example');try{
  const external=await verifyGoogleToken(await sign(),config.clientId,'dual-nonce',key);
  await assert.rejects(()=>f.google.complete({intent:'signup'},external,null),/Confirm your email/);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM google_identities').get()!.n,0);
  const verified=await verifyGoogleToken(await sign({hd:'synthetic.example'}),config.clientId,'dual-nonce',key);assert.equal(verified.hostedDomain,'synthetic.example');
  await assert.rejects(()=>f.google.complete({intent:'login'},verified,null),GoogleAccountClaimRequired);const token=await finishSyntheticGoogleClaim(f.google,{intent:'login'},verified,null);assert.equal((await f.auth.user(cookieName()+'='+token))!.userId,f.user.userId);
  for(const hd of ['',123,'synthetic.example/untrusted',' ','bad..example'])await assert.rejects(()=>sign({hd}).then(token=>verifyGoogleToken(token,config.clientId,'dual-nonce',key)));
  await assert.rejects(()=>sign({hd:'synthetic.example',email_verified:false}).then(token=>verifyGoogleToken(token,config.clientId,'dual-nonce',key)));
 }finally{f.sqlite.close();}
});

test('disabled, removed and unsupported memberships never gain Google access',async()=>{
 for(const state of ['disabled','removed','role']){const f=await fixture();try{
  if(state==='disabled')f.sqlite.prepare('UPDATE password_accounts SET disabled=1').run();else if(state==='removed')f.sqlite.prepare('DELETE FROM memberships').run();else f.sqlite.prepare("UPDATE memberships SET role='UNSUPPORTED'").run();
  await assert.rejects(()=>f.google.complete({intent:'signup'},{subject:'blocked-sub',email:'dual.synthetic@gmail.com'},null),/unavailable/);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM google_identities').get()!.n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM organizations').get()!.n,1);
 }finally{f.sqlite.close();}}
});

test('a conflicting Google identity is never replaced and subject-based login never merges another email owner',async()=>{
 const f=await fixture();try{
  f.sqlite.prepare('INSERT INTO google_identities VALUES(?,?,?,?)').run('original-sub',f.user.userId,'dual.synthetic@gmail.com',new Date().toISOString());
  await assert.rejects(()=>f.google.complete({intent:'signup'},{subject:'different-sub',email:'dual.synthetic@gmail.com'},null),/different Google account/);
  const other=await f.auth.signup('other.synthetic@gmail.com',password,'Separate synthetic business','other-dual-ip'),otherUser=(await f.auth.user(cookieName()+'='+other))!;
  const token=await f.google.complete({intent:'login'},{subject:'original-sub',email:'other.synthetic@gmail.com'},null);assert.equal((await f.auth.user(cookieName()+'='+token))!.userId,f.user.userId);assert.notEqual(f.user.userId,otherUser.userId);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM google_identities').get()!.n,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM organizations').get()!.n,2);
 }finally{f.sqlite.close();}
});

test('concurrent first Google attempts do not attach by email or issue sessions before mailbox proof',async()=>{const f=await fixture();try{const before=f.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get()!.n,results=await Promise.allSettled([1,2].map(()=>f.google.complete({intent:'signup'},{subject:'same-sub',email:'dual.synthetic@gmail.com'},null)));for(const r of results){assert.equal(r.status,'rejected');if(r.status==='rejected')assert.ok(r.reason instanceof GoogleAccountClaimRequired);}assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM google_identities').get()!.n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get()!.n,before);}finally{f.sqlite.close();}});

test('credential changes and failed audit writes do not leave an unaudited provider link or issue a session',async()=>{
 for(const state of ['version','audit']){const f=await fixture();try{
  const sessions=f.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get()!.n,original=f.db.batch.bind(f.db);let first=true;
  if(state==='version')f.db.batch=(async(statements:any[])=>{if(first){first=false;f.sqlite.prepare("UPDATE password_accounts SET credential_version='changed-version'").run();}return original(statements);}) as typeof f.db.batch;
  else f.sqlite.exec("CREATE TRIGGER fail_dual_audit BEFORE INSERT ON audit WHEN NEW.action='account.google.email-claim' BEGIN SELECT RAISE(ABORT,'Synthetic rollback'); END");
  await assert.rejects(()=>finishSyntheticGoogleClaim(f.google,{intent:'signup'},{subject:'must-not-link',email:'dual.synthetic@gmail.com'},null));
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM google_identities').get()!.n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get()!.n,sessions);
 }finally{f.sqlite.close();}}
});

test('the browser-bound callback preserves already-linked Google and password sign-in without a reset',async()=>{
 const f=await apiFixture(),auth=new AuthService(f.db);let exchange:ReturnType<typeof vi.spyOn>|undefined;
 try{
  const original=await auth.signup('callback.synthetic@gmail.com',password,'Synthetic callback business','dual-callback-ip'),user=(await auth.user(cookieName()+'='+original))!,count=f.sqlite.prepare('SELECT COUNT(*) n FROM organizations').get()!.n;
  f.sqlite.prepare('INSERT INTO google_identities VALUES(?,?,?,?)').run('callback-existing-sub',user.userId,'callback.synthetic@gmail.com',new Date().toISOString());
  Object.assign(f.env,{GOOGLE_CLIENT_ID:config.clientId,GOOGLE_CLIENT_SECRET:config.clientSecret,GOOGLE_REDIRECT_URI:config.redirectUri});
  const start=await googleStart.POST(new Request('https://local.test/api/auth/google/start',{method:'POST',headers:{Origin:'https://local.test','Content-Type':'application/json'},body:JSON.stringify({intent:'signup',businessName:'Do not create a duplicate'})}));
  assert.equal(start.status,200);const url=new URL(((await start.json()) as {url:string}).url),browser=start.headers.get('set-cookie')!.split(';')[0];
  exchange=vi.spyOn(GoogleAuth.prototype,'exchange').mockResolvedValue({subject:'callback-existing-sub',email:'callback.synthetic@gmail.com'});
  const result=await googleCallback.GET(new Request('https://local.test/api/auth/google/callback?state='+url.searchParams.get('state')+'&code=synthetic-verified-code',{headers:{Cookie:browser}}));
  assert.equal(result.status,303);assert.equal(result.headers.get('location'),'https://local.test/');
  const session=result.headers.getSetCookie().find(value=>value.startsWith(cookieName()+'='))!.split(';')[0];assert.equal((await auth.user(session))!.userId,user.userId);
  const response=await f.request('/api/auth',undefined,{cookie:session}),state=await response.json() as any;assert.equal(state.email,'callback.synthetic@gmail.com');assert.equal(state.hasPassword,true);assert.equal(state.googleLinked,true);
  const passwordToken=await auth.login(state.email,password,'dual-callback-password');assert.equal((await auth.user(cookieName()+'='+passwordToken))!.userId,user.userId);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM organizations').get()!.n,count);
 }finally{exchange?.mockRestore();f.sqlite.close();}
});
