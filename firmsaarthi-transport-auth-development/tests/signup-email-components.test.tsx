// @vitest-environment jsdom
import {afterEach,test,vi} from 'vitest';
import assert from 'node:assert/strict';
import {render,screen,waitFor,cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {browserFixture} from './helpers/browser';
import Login from '../app/login';
import SignupEmailForm from '../app/signup-email-form';
import {AuthService} from '../lib/auth';
const dbs:{close:()=>void}[]=[],draftKey='firmsaarthi:signup-draft:v1',password='Synthetic passphrase 2026';
async function fixture(configured=true){
 const f=await browserFixture(),mail:any[]=[];dbs.push(f.sqlite);f.setCookie('');
 if(configured)Object.assign(f.env,{RESEND_API_KEY:'re_synthetic_test_key',PASSWORD_RESET_FROM:'no-reply@synthetic.test',PASSWORD_RESET_REPLY_TO:'support@synthetic.test',PASSWORD_RESET_SECRET:'ab'.repeat(32)});
 const localFetch=globalThis.fetch;vi.stubGlobal('fetch',async(input:any,init:any={})=>{if(String(input)==='https://api.resend.com/emails'){mail.push(JSON.parse(init.body));return Response.json({id:'synthetic'});}return localFetch(input,init);});
 return {...f,mail,user:userEvent.setup()};
}
afterEach(()=>{cleanup();for(const db of dbs.splice(0))db.close();sessionStorage.removeItem(draftKey);vi.unstubAllGlobals();vi.restoreAllMocks();window.history.replaceState(null,'','/');});
function form(){return <SignupEmailForm initialEmail="" onEmailChange={()=>{}} onBusinessNameChange={()=>{}} onBusyChange={()=>{}}/>;}
async function verify(f:Awaited<ReturnType<typeof fixture>>,email='component@synthetic.test'){
 await screen.findByLabelText('Email address');await f.user.type(screen.getByLabelText('Email address'),email);await f.user.click(screen.getByRole('button',{name:'Send confirmation code'}));
 await screen.findByLabelText('Six-digit code');assert.ok(!screen.queryByLabelText('Business name'));assert.ok(!screen.queryByLabelText('Password (15–128 characters)'));assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM organizations').get()!.n,1);
 await f.user.type(screen.getByLabelText('Six-digit code'),f.mail[0].text.match(/code is (\d{6})/)[1]);await f.user.click(screen.getByRole('button',{name:'Verify email'}));await screen.findByLabelText('Business name');
}
test('real login signup UI proves mail first, explains mismatched confirmation and creates one isolated workspace',async()=>{
 const f=await fixture();render(<Login/>);await f.user.click(screen.getByRole('button',{name:'Create account'}));await verify(f);
 await f.user.type(screen.getByLabelText('Business name'),'Synthetic component business');const input=screen.getByLabelText('Password (15–128 characters)');assert.equal(input.getAttribute('minlength'),'15');await f.user.type(input,password);await f.user.type(screen.getByLabelText('Confirm password'),'Mismatched passphrase');await f.user.click(screen.getByRole('button',{name:'Create account'}));assert.ok(screen.getByRole('alert').textContent?.includes('do not match'));
 await f.user.clear(screen.getByLabelText('Confirm password'));await f.user.type(screen.getByLabelText('Confirm password'),password);await f.user.click(screen.getByRole('button',{name:'Create account'}));await screen.findByText('Account created. Opening your workspace…');
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM organizations').get()!.n,2);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM account_email_proofs').get()!.n,1);assert.equal(sessionStorage.getItem(draftKey),null);assert.ok(!f.calls.some(c=>c.path==='/api/auth'&&c.body?.action==='signup'));
});
test('reload restores only a matching protected signup draft and never persists password, OTP or bearer material',async()=>{
 const f=await fixture(),first=render(form());await verify(f);await f.user.type(screen.getByLabelText('Business name'),'Synthetic saved draft');await f.user.type(screen.getByLabelText('Password (15–128 characters)'),password);
 const saved=JSON.parse(sessionStorage.getItem(draftKey)!);assert.deepEqual(Object.keys(saved).sort(),['at','businessName','email']);assert.equal(saved.email,'component@synthetic.test');
 first.unmount();render(form());const name=await screen.findByLabelText('Business name');assert.equal((name as HTMLInputElement).value,'Synthetic saved draft');assert.equal((screen.getByLabelText('Password (15–128 characters)') as HTMLInputElement).value,'');assert.equal((screen.getByLabelText('Confirm password') as HTMLInputElement).value,'');
});
test('failed completion preserves reviewed inputs, then retry creates only one account',async()=>{
 const f=await fixture();render(form());await verify(f);await f.user.type(screen.getByLabelText('Business name'),'Synthetic retry business');await f.user.type(screen.getByLabelText('Password (15–128 characters)'),password);await f.user.type(screen.getByLabelText('Confirm password'),password);
 const actual=globalThis.fetch;let attempts=0;vi.stubGlobal('fetch',async(input:any,init:any={})=>{if(String(input)==='/api/auth/signup-email'&&init.method==='POST'&&JSON.parse(init.body).action==='complete'&&++attempts===1)throw Error('Synthetic network interruption. Try again with the same details.');return actual(input,init);});
 await f.user.click(screen.getByRole('button',{name:'Create account'}));await screen.findByRole('alert');assert.equal((screen.getByLabelText('Business name') as HTMLInputElement).value,'Synthetic retry business');assert.equal((screen.getByLabelText('Password (15–128 characters)') as HTMLInputElement).value,password);
 await f.user.click(screen.getByRole('button',{name:'Create account'}));await screen.findByText('Account created. Opening your workspace…');assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM organizations').get()!.n,2);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit WHERE action='account.verified-signup'").get()!.n,1);
});
test('unavailable email is honestly gated and existing eight-character password login is retained',async()=>{
 const f=await fixture(false),view=render(<Login/>);await f.user.click(screen.getByRole('button',{name:'Create account'}));await screen.findByText(/Email registration is temporarily unavailable/);assert.ok(!screen.queryByRole('button',{name:'Send confirmation code'}));view.unmount();
 const auth=new AuthService(f.db);await auth.signup('existing-ui@synthetic.test','Eight123','Synthetic existing login','seed');render(<Login/>);await f.user.type(screen.getByLabelText('Email address'),'existing-ui@synthetic.test');await f.user.type(screen.getByLabelText('Password',{exact:true}),'Eight123');await f.user.click(screen.getByRole('button',{name:'Sign in'}));await waitFor(async()=>assert.equal((await auth.user(f.getCookie()))?.email,'existing-ui@synthetic.test'));
});
