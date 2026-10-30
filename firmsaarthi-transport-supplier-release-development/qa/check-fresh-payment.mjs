import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {createInterface} from 'node:readline';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
if(process.stdin.isTTY)process.stdin.setRawMode(true);console.log('Ready for hidden Test-payment configuration.');
const lines=createInterface({input:process.stdin,terminal:false}),queue=[],waiters=[];lines.on('line',s=>{const v=JSON.parse(s);const next=waiters.shift();if(next)next(v);else queue.push(v);});
const read=()=>queue.length?Promise.resolve(queue.shift()):new Promise(resolve=>waiters.push(resolve));
const input=await read(),origin='https://firmsaarthi-transport-staging.arjit-tiwari-ece14.chatgpt.site',fingerprint=JSON.parse(readFileSync('lib/release-info.json','utf8')).fingerprint;
assert.equal(input.origin,origin);assert.ok(input.token&&input.password&&input.fixtureSuffix);mkdirSync('outputs/fresh-payment',{recursive:true});
const safe=e=>String(e).replace(/(?:^|\n)[^\n]*\b(?:cookie|authorization):[^\n]*/gi,'[private header omitted]').replaceAll(input.token,'[redacted]').replaceAll(input.password,'[redacted]');
const browser=await chromium.launch({channel:'msedge',headless:true}),c=await browser.newContext({viewport:{width:390,height:844},baseURL:origin,serviceWorkers:'block'}),p=await c.newPage();let interrupted=false;
await c.route('**/*',async r=>{const url=new URL(r.request().url()),headers={...r.request().headers()};delete headers['oai-sites-authorization'];if(url.origin===origin)headers['OAI-Sites-Authorization']='Bearer '+input.token;if(url.origin===origin&&url.pathname==='/api/plan-payments'&&r.request().method()==='POST'&&!interrupted){let data;try{data=r.request().postDataJSON();}catch{}if(data?.action==='verify'){interrupted=true;return r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic lost callback; use Check payment status.'})});}}return r.continue({headers});});
// APIRequestContext does not pass through page routes; authenticate it only to
// its exact private origin, never to Razorpay or another provider.
const apiHeaders={'OAI-Sites-Authorization':'Bearer '+input.token,Origin:origin};
async function get(path){const r=await c.request.get(origin+path,{headers:apiHeaders});assert.equal(r.status(),200,path);return r.json();}
async function post(path,data){const r=await c.request.post(origin+path,{headers:apiHeaders,data});assert.equal(r.status(),200,path);return r.json();}
try{
 const release=await get('/api/release');assert.equal(release.environment,'staging');assert.equal(release.fingerprint,fingerprint);
 await post('/api/auth',{action:'login',email:`supplier-payment-phone-${input.fixtureSuffix}@staging.test`,password:input.password});const payment=await get('/api/plan-payments');assert.equal(payment.enabled,true);assert.equal(payment.mode,'test');
 const before=await get('/api/billing'),pnlBefore=await get('/api/tms?report=company-pnl&year=2026-2027');assert.equal(before.payments.length,0);
 await p.goto(origin+'/manage-plan');await expect(p.getByText('Test payments only. No real money is collected.',{exact:true})).toBeVisible();assert.deepEqual(await p.evaluate(()=>({width:innerWidth,height:innerHeight})),{width:390,height:844});
 await p.getByRole('button',{name:'Choose Team Annual',exact:true}).click();await p.getByRole('button',{name:/^(Pay with Razorpay|Continue checkout)$/}).click();
 console.log('Test checkout opened; waiting for grounded UI commands.');
 for(;;){const cmd=await read();if(cmd.action==='stop')break;if(cmd.action==='inspect'){const pages=c.pages();for(let i=0;i<pages.length;i++){console.log('PAGE '+i);for(let j=0;j<pages[i].frames().length;j++){if(cmd.page!==undefined&&i!==cmd.page)continue;if(cmd.frame!==undefined&&j!==cmd.frame)continue;const f=pages[i].frames()[j];console.log('FRAME '+j+' '+new URL(f.url()||'about:blank').origin);console.log(safe((await f.locator('body').ariaSnapshot()).slice(0,6500)));}}continue;}
 if(cmd.action==='finish'){
  assert.equal(interrupted,true,'Must prove an actual provider callback was lost, not simulate capture.');await p.reload();await expect(p.getByRole('button',{name:'Check payment status',exact:true})).toBeVisible();await p.getByRole('button',{name:'Check payment status',exact:true}).click();await expect(p.getByText('Payment verified. Your plan access is active.',{exact:true})).toBeVisible();
  const after=await get('/api/billing'),pnl=await get('/api/tms?report=company-pnl&year=2026-2027');assert.equal(after.payments.length,1);const order=(await get('/api/plan-payments')).pending;
  assert.equal(order,null);assert.equal(after.currentPlan.tier,'team');assert.equal(after.currentPlan.interval,'yearly');assert.equal(pnl.report.netProfit,pnlBefore.report.netProfit);
  // Use the saved intent discovered through the existing response, without
  // exposing provider signatures, credentials or intercepted cookie values.
  const intent=input.intentId;assert.ok(intent,'Pass the actual saved intent ID from the pending-order read.');
  const replies=await Promise.all(Array.from({length:6},()=>post('/api/plan-payments',{action:'refresh',id:intent})));assert.ok(replies.every(r=>r.alreadyRecorded===true));const final=await get('/api/billing');assert.deepEqual(final.payments,after.payments);assert.deepEqual(final.currentPlan,after.currentPlan);
  await p.screenshot({path:'outputs/fresh-payment/phone-recovered.png',fullPage:true});writeFileSync('outputs/fresh-payment/validated.json',JSON.stringify({projectId:'appgprj_6ae065554e2c819195306c14a182519e',origin,environment:'staging',fingerprint,versionId:input.versionId,deploymentId:input.deploymentId,status:'passed',runner:'playwright',device:'phone',measuredViewport:{width:390,height:844},capturedTestPayment:true,lostCallback:true,concurrentReplays:6,grantCount:1,accountingUnchanged:true,completedAt:new Date().toISOString()},null,2));console.log('Fresh Test capture and recovery passed.');break;
 }
 if(cmd.action==='intent'){const pending=(await get('/api/plan-payments')).pending;assert.ok(pending?.id);input.intentId=pending.id;console.log('Actual pending Test intent retained in memory.');continue;}
 const page=c.pages()[cmd.page||0],frame=page.frames()[cmd.frame||0];let locator=cmd.label?frame.getByLabel(cmd.label,{exact:true}):cmd.placeholder?frame.getByPlaceholder(cmd.placeholder,{exact:true}):frame.getByRole(cmd.role||'button',{name:cmd.name,exact:true});
 if(cmd.which==='last')locator=locator.last();if(cmd.action==='click')await locator.click({timeout:15000});else if(cmd.action==='fill')await locator.fill(cmd.value);else throw Error('Unknown QA action');console.log('UI action completed.');
 }
}catch(e){console.error(safe(e));process.exitCode=1;}finally{await c.request.post(origin+'/api/auth',{headers:apiHeaders,data:{action:'logout'}}).catch(()=>{});await browser.close();lines.close();}
