// @vitest-environment jsdom
import {afterEach,test,vi,expect} from 'vitest';
import {render,screen,cleanup,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {browserFixture} from './helpers/browser';
import {GoogleAccountClaim,claimCookie,claimCookieName} from '../lib/google-account-claim';
import ClaimForm from '../app/account/claim/review';
const dbs:{close:()=>void}[]=[],fresh='Fresh synthetic UI passphrase';
async function fixture(){
 const f=await browserFixture(),mail:any[]=[];dbs.push(f.sqlite);f.setCookie('');
 Object.assign(f.env,{RESEND_API_KEY:'re_synthetic_test_key',PASSWORD_RESET_FROM:'no-reply@synthetic.test',PASSWORD_RESET_REPLY_TO:'support@synthetic.test',PASSWORD_RESET_SECRET:'ab'.repeat(32)});
 const row=f.sqlite.prepare('SELECT a.*,m.org_id,m.role FROM password_accounts a JOIN memberships m ON m.user_id=a.user_id').get() as any,service=new GoogleAccountClaim(f.db,'ab'.repeat(32),async()=>{}),session=await service.start({userId:row.user_id,orgId:row.org_id,role:row.role,credentialVersion:row.credential_version,email:row.email,subject:'synthetic-ui-subject'});
 f.setCookie(claimCookie(claimCookieName(),session.id+'.'+session.proof).split(';')[0]);
 const actual=globalThis.fetch;vi.stubGlobal('fetch',async(input:any,init:any={})=>{if(String(input)==='https://api.resend.com/emails'){mail.push(JSON.parse(init.body));return Response.json({id:'synthetic-local-mail'});}return actual(input,init);});
 return {...f,mail,service,session,row,user:userEvent.setup()};
}
afterEach(()=>{cleanup();for(const db of dbs.splice(0))db.close();sessionStorage.clear();localStorage.clear();vi.unstubAllGlobals();vi.restoreAllMocks();});
async function ready(f:Awaited<ReturnType<typeof fixture>>){await screen.findByRole('button',{name:'Send confirmation code'});await f.user.click(screen.getByRole('button',{name:'Send confirmation code'}));await screen.findByLabelText('Six-digit code');expect(screen.queryByText(/Existing workspace:/)).toBe(null);await f.user.type(screen.getByLabelText('Six-digit code'),f.mail[0].text.match(/code is (\d{6})/)[1]);await f.user.click(screen.getByRole('button',{name:'Verify email'}));await screen.findByLabelText('Fresh FirmSaarthi password (8–128 characters)');}
test('Google claim UI confirms mail before showing workspace, requires matching fresh password and explicit session/link consent',async()=>{
 const f=await fixture();render(<ClaimForm/>);await ready(f);
 expect(screen.getByText(/Existing workspace:/).textContent).toContain('Synthetic API business');
 await f.user.type(screen.getByLabelText('Fresh FirmSaarthi password (8–128 characters)'),fresh);await f.user.type(screen.getByLabelText('Confirm fresh password'),'Different fresh password');await f.user.click(screen.getByRole('checkbox'));await f.user.click(screen.getByRole('button',{name:'Secure profile and sign in'}));await screen.findByText('Passwords do not match.');expect(f.sqlite.prepare('SELECT COUNT(*) n FROM google_identities').get()).toMatchObject({n:0});
 await f.user.clear(screen.getByLabelText('Confirm fresh password'));await f.user.type(screen.getByLabelText('Confirm fresh password'),fresh);await f.user.click(screen.getByRole('button',{name:'Secure profile and sign in'}));await waitFor(()=>expect(f.sqlite.prepare('SELECT COUNT(*) n FROM google_identities').get()).toMatchObject({n:1}));
 expect(f.sqlite.prepare("SELECT COUNT(*) n FROM audit WHERE action='account.google.email-claim'").get()).toMatchObject({n:1});expect(sessionStorage.length).toBe(0);expect(localStorage.length).toBe(0);
});
test('claim reload restores verified review but never restores a fresh password or consent',async()=>{
 const f=await fixture(),view=render(<ClaimForm/>);await ready(f);await f.user.type(screen.getByLabelText('Fresh FirmSaarthi password (8–128 characters)'),fresh);await f.user.click(screen.getByRole('checkbox'));view.unmount();render(<ClaimForm/>);
 const password=await screen.findByLabelText('Fresh FirmSaarthi password (8–128 characters)');expect((password as HTMLInputElement).value).toBe('');expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);expect(sessionStorage.length).toBe(0);expect(localStorage.length).toBe(0);expect(f.sqlite.prepare('SELECT COUNT(*) n FROM google_identities').get()).toMatchObject({n:0});
});
test('failed claim completion keeps reviewed inputs and retries only the same confirmed change',async()=>{
 const f=await fixture();render(<ClaimForm/>);await ready(f);await f.user.type(screen.getByLabelText('Fresh FirmSaarthi password (8–128 characters)'),fresh);await f.user.type(screen.getByLabelText('Confirm fresh password'),fresh);await f.user.click(screen.getByRole('checkbox'));
 const actual=globalThis.fetch;let once=true;vi.stubGlobal('fetch',async(input:any,init:any={})=>{if(String(input)==='/api/auth/google/claim'&&init.method==='POST'&&JSON.parse(init.body).action==='complete'&&once){once=false;throw Error('Synthetic interrupted response');}return actual(input,init);});
 await f.user.click(screen.getByRole('button',{name:'Secure profile and sign in'}));await screen.findByText('Synthetic interrupted response');expect((screen.getByLabelText('Confirm fresh password') as HTMLInputElement).value).toBe(fresh);expect(f.sqlite.prepare('SELECT COUNT(*) n FROM google_identities').get()).toMatchObject({n:0});await f.user.click(screen.getByRole('button',{name:'Secure profile and sign in'}));await waitFor(()=>expect(f.sqlite.prepare('SELECT COUNT(*) n FROM google_identities').get()).toMatchObject({n:1}));
});
