// @vitest-environment jsdom
import {afterEach,test,vi} from 'vitest';
import assert from 'node:assert/strict';
import {render,screen,waitFor,cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from '../app/login';
import PasswordResetForm from '../app/account/forgot/reset-form';
import {browserFixture} from './helpers/browser';
import {routeHandlers} from './helpers/api';
import * as resetRoute from '../app/api/auth/password-reset/route';
import {AuthService,cookieName} from '../lib/auth';
afterEach(()=>{delete routeHandlers['/api/auth/password-reset'];cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
test('sign-in links to local email recovery and the real UI completes OTP, password and sign-in without ChatGPT',async()=>{
 const f=await browserFixture();try{Object.assign(f.env,{RESEND_API_KEY:'re_synthetic_test_key',PASSWORD_RESET_FROM:'no-reply@mail.firmsaarthi.com',PASSWORD_RESET_REPLY_TO:'firmsaarthi@gmail.com',PASSWORD_RESET_SECRET:'ab'.repeat(32)});routeHandlers['/api/auth/password-reset']=resetRoute;
  const originalFetch=globalThis.fetch;let deliveredCode='';vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{if(String(input)==='https://api.resend.com/emails'){deliveredCode=JSON.parse(String(init?.body)).text.match(/is (\d{6})/)[1];return Response.json({id:'synthetic-delivery'});}return originalFetch(input,init);});
  const login=render(<Login/>);assert.equal(screen.getByRole('link',{name:'Forgot password?'}).getAttribute('href'),'/account/forgot');assert.equal(screen.queryByText('Recover owner access'),null);login.unmount();
  const oldCookie=f.getCookie(),user=userEvent.setup();render(<PasswordResetForm/>);await user.type(await screen.findByLabelText('Email address'),'owner@api.test');await user.click(screen.getByRole('button',{name:'Send code'}));const input=await screen.findByLabelText('Six-digit code');assert.match(deliveredCode,/^\d{6}$/);assert.ok(f.getCookie().includes('tms_reset='));assert.equal((await screen.findByRole('button',{name:/Resend code in/})).hasAttribute('disabled'),true);
  const wrong=deliveredCode==='000000'?'111111':'000000';await user.type(input,wrong);await user.click(screen.getByRole('button',{name:'Verify code'}));await screen.findByRole('alert');await user.clear(input);await user.type(input,deliveredCode);await user.click(screen.getByRole('button',{name:'Verify code'}));
  await user.type(await screen.findByLabelText('New password'),'Reset123');await user.type(screen.getByLabelText('Confirm new password'),'Different123');await user.click(screen.getByRole('button',{name:'Reset password'}));await screen.findByText('Passwords do not match.');assert.equal(f.calls.filter(c=>c.body?.action==='complete').length,0);await user.clear(screen.getByLabelText('Confirm new password'));await user.type(screen.getByLabelText('Confirm new password'),'Reset123');await user.click(screen.getByRole('button',{name:'Reset password'}));await screen.findByRole('heading',{name:'Password updated'});
  assert.equal(screen.getByRole('link',{name:'Back to sign in'}).getAttribute('href'),'/');assert.equal(await new AuthService(f.db).user(oldCookie),null);const session=await new AuthService(f.db).login('owner@api.test','Reset123','ui-new-login');assert.equal((await new AuthService(f.db).user(cookieName()+'='+session))!.userId,'api-owner');assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM organizations').get()!.n,1);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit WHERE action='account.email-password-reset'").get()!.n,1);
 }finally{f.sqlite.close();}
});
test('unconfigured mail is honestly gated and never sends users to ChatGPT recovery',async()=>{const f=await browserFixture();try{routeHandlers['/api/auth/password-reset']=resetRoute;render(<PasswordResetForm/>);await screen.findByText(/Email reset is temporarily unavailable/);assert.equal(screen.queryByRole('button',{name:'Send code'}),null);assert.equal(screen.getByRole('link',{name:'firmsaarthi@gmail.com'}).getAttribute('href'),'mailto:firmsaarthi@gmail.com');assert.equal(screen.getByRole('link',{name:'Back to sign in'}).getAttribute('href'),'/');assert.equal(f.calls.some(c=>c.path.includes('chatgpt')||c.path.includes('/api/auth/recover')),false);}finally{f.sqlite.close();}});
