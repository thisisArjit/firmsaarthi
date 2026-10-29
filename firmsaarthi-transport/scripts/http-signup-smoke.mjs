import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const base=process.env.TMS_SMOKE_URL||'http://127.0.0.1:5174';
assert.equal(new URL(base).hostname,'127.0.0.1','Synthetic signups must only run locally.');
const tag=randomUUID().replaceAll('-',''),email=`signup-${tag}@tms.test`,secondEmail=`second-${tag}@tms.test`,password='Synthetic signup test 123!';
async function request(path,body,cookie='',origin=base){return fetch(base+path,{method:body?'POST':'GET',redirect:'manual',headers:{...(body?{'Content-Type':'application/json',Origin:origin}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});}
try{
  const home=await request('/');assert.equal(home.status,200);assert.match(await home.text(),/Create account/);
  const settings=await (await request('/api/auth')).json();assert.equal(settings.googleEnabled,false);assert.equal(settings.email,null);
  assert.equal((await request('/api/auth',{action:'signup',email,password,businessName:'Synthetic business'},'','https://evil.invalid')).status,403);
  assert.equal((await request('/api/auth',{action:'signup',email,password:'short',businessName:'Synthetic business'})).status,400);
  const response=await request('/api/auth',{action:'signup',email,password,businessName:'Synthetic signup business'});assert.equal(response.status,200,await response.clone().text());
  const cookie=response.headers.get('set-cookie').split(';')[0];assert.match(response.headers.get('set-cookie'),/HttpOnly/);
  const state=await (await request('/api/tms?year=2026-2027',null,cookie)).json();assert.equal(state.member.role,'OWNER');assert.equal(state.business.name,'Synthetic signup business');assert.equal(state.consignments.length,0);
  const account=await request('/account',null,cookie);assert.equal(account.status,200);assert.match(await account.text(),/My account/);
  const other=await request('/api/auth',{action:'signup',email:secondEmail,password,businessName:'Synthetic second business'});assert.equal(other.status,200);const otherCookie=other.headers.get('set-cookie').split(';')[0];const second=await (await request('/api/tms?year=2026-2027',null,otherCookie)).json();assert.notEqual(second.business.id,state.business.id);
  assert.equal((await request('/api/auth',{action:'signup',email,password,businessName:'Duplicate'})).status,409);
  assert.equal((await request('/api/auth/google/start',{intent:'login'})).status,503);
  const callback=await request('/api/auth/google/callback?state=invalid&code=invalid');assert.equal(callback.status,303);assert.ok(callback.headers.get('location').endsWith('/?auth=google-failed'));assert.ok(!callback.headers.get('set-cookie').includes('tms_session='));
  await request('/api/auth',{action:'logout'},cookie);assert.equal((await request('/api/tms?year=2026-2027',null,cookie)).status,401);
  assert.equal((await request('/api/auth',{action:'login',email,password})).status,200);
  console.log('Local HTTP signup, isolation, sign-in/out, CSRF and unavailable-Google checks passed.');
}finally{
  // Only this run's two synthetic workspaces; never production or customer data.
  const where=`email IN ('${email}','${secondEmail}')`,orgs=`SELECT org_id FROM memberships WHERE ${where}`;
  const sql=`DELETE FROM subscription_grants WHERE org_id IN (${orgs}); DELETE FROM subscriptions WHERE org_id IN (${orgs}); DELETE FROM audit WHERE org_id IN (${orgs}); DELETE FROM memberships WHERE ${where}; DELETE FROM organizations WHERE owner_id IN (SELECT user_id FROM password_accounts WHERE ${where}) AND NOT EXISTS(SELECT 1 FROM memberships WHERE org_id=organizations.id); DELETE FROM password_accounts WHERE ${where};`;
  const result=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--command',sql],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
}
