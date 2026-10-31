// @vitest-environment jsdom
import {afterEach,test,vi} from 'vitest';
import assert from 'node:assert/strict';
import {render,screen,waitFor,cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from '../app/login';
import {browserFixture} from './helpers/browser';
import {GoogleAuth} from '../lib/google-auth';
import {AuthService,cookieName} from '../lib/auth';
import {TransportService} from '../lib/service';

afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
for(const mode of ['login','signup-empty','signup-named'])test(`Google ${mode} respects explicit registration and saved account identity`,async()=>{
 const f=await browserFixture();
 try{
  f.setCookie('');
  const config={clientId:'synthetic-client',clientSecret:'synthetic-secret',redirectUri:'https://local.test/api/auth/google/callback'};
  Object.assign(f.env,{GOOGLE_CLIENT_ID:config.clientId,GOOGLE_CLIENT_SECRET:config.clientSecret,GOOGLE_REDIRECT_URI:config.redirectUri});
  const mail:any[]=[];
  if(mode==='signup-named'){
   Object.assign(f.env,{RESEND_API_KEY:'re_synthetic_test_key',PASSWORD_RESET_FROM:'no-reply@synthetic.test',PASSWORD_RESET_REPLY_TO:'support@synthetic.test',PASSWORD_RESET_SECRET:'ab'.repeat(32)});
   const localFetch=globalThis.fetch;vi.stubGlobal('fetch',async(input:any,init:any={})=>{if(String(input)==='https://api.resend.com/emails'){mail.push(JSON.parse(init.body));return Response.json({id:'synthetic'});}return localFetch(input,init);});
  }
  const user=userEvent.setup();render(<Login/>);
  if(mode!=='login'){await user.click(screen.getByRole('button',{name:'Create account'}));await user.click(screen.getByRole('button',{name:'Transport provider'}));}
  if(mode==='signup-named'){
   await user.type(await screen.findByLabelText('Email address'),'signup-named@continue.test');await user.click(screen.getByRole('button',{name:'Send confirmation code'}));
   await user.type(await screen.findByLabelText('Six-digit code'),mail[0].text.match(/code is (\d{6})/)[1]);await user.click(screen.getByRole('button',{name:'Verify email'}));
   await user.type(await screen.findByLabelText('Business name'),'Synthetic Google business');
  }
  await user.click(await screen.findByRole('button',{name:'Continue with Google'}));
  await waitFor(()=>assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM google_flows').get()!.n,1));
  const request=f.calls.find(c=>c.path==='/api/auth/google/start');
  assert.equal(request!.body.intent,mode==='login'?'login':'signup');
  const name=mode==='signup-named'?'Synthetic Google business':'My business';
  assert.equal(request!.body.businessName,name);
  // Provider verification is tested separately; this exercises the actual UI,
  // start route and transactional completion with a synthetic verified identity.
  const flow=f.sqlite.prepare('SELECT * FROM google_flows').get()!,google=new GoogleAuth(f.db,config),auth=new AuthService(f.db);
  const identity={subject:'synthetic-continue-'+mode,email:mode+'@continue.test'};
  if(mode==='login'){
   const before=f.sqlite.prepare('SELECT COUNT(*) n FROM organizations').get()!.n;
   await assert.rejects(()=>google.complete(flow,identity,null),/No linked account/);
   assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM organizations').get()!.n,before);
   assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM google_identities').get()!.n,0);
   return;
  }
  const token=await google.complete(flow,identity,null),account=(await auth.user(`${cookieName()}=${token}`))!;
  const member=await new TransportService(f.db,account).member();assert.equal(member.role,'OWNER');
  assert.equal(f.sqlite.prepare('SELECT name FROM organizations WHERE id=?').get(member.org_id)!.name,name);
  assert.notEqual(member.org_id,(await f.owner.member()).org_id);
  const count=f.sqlite.prepare('SELECT COUNT(*) n FROM organizations').get()!.n;
  const repeated=await google.complete(flow,identity,null);
  assert.equal((await auth.user(`${cookieName()}=${repeated}`))!.userId,account.userId);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM organizations').get()!.n,count);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM google_identities WHERE subject=?').get(identity.subject)!.n,1);
 }finally{cleanup();f.sqlite.close();}
});
