// Synthetic, actual hosted stage-to-stage smoke. This is partial evidence,
// not the complete shared-account release matrix or direct public backchannel.
import {chromium,expect as baseExpect} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createInterface} from 'node:readline';
const expect=baseExpect.configure({timeout:30000});
if(process.stdin.isTTY)process.stdin.setRawMode(true);
console.log('Ready for hidden synthetic shared-account smoke configuration.');
const lines=createInterface({input:process.stdin,terminal:false}),queue=[],waiting=[];
lines.on('line',line=>{const data=JSON.parse(line),resolve=waiting.shift();if(resolve)resolve(data);else queue.push(data);});
const read=()=>queue.length?Promise.resolve(queue.shift()):new Promise(resolve=>waiting.push(resolve));
const cfg=await read(),transport='https://firmsaarthi-transport-staging.arjit-tiwari-ece14.chatgpt.site',sites='https://firmsaarthi-sites-private-staging.arjit-tiwari-ece14.chatgpt.site';
assert.equal(cfg.transportOrigin,transport);assert.equal(cfg.sitesOrigin,sites);
const fingerprint=JSON.parse(readFileSync('lib/release-info.json','utf8')).fingerprint;
const safe=e=>String(e).replace(/(?:^|\n)[^\n]*\b(?:cookie|authorization):[^\n]*/gi,'[private header omitted]').replaceAll(cfg.password,'[password omitted]').replaceAll(cfg.transportToken,'[token omitted]').replaceAll(cfg.sitesToken,'[token omitted]').replace(/https:\/\/[^\s]+\?(?:ticket|state|code)=[^\s]+/g,'[private handoff URL omitted]').replace(/\b\d{6}\b/g,'[code omitted]');
const browser=await chromium.launch({channel:'msedge',headless:true}),contexts=[],results=[];let page;
mkdirSync('outputs/shared-smoke',{recursive:true});
async function context(viewport){const c=await browser.newContext({viewport,serviceWorkers:'block'});await c.route('**/*',async r=>{const h={...r.request().headers()};delete h['oai-sites-authorization'];const o=new URL(r.request().url()).origin;if(o===transport)h['OAI-Sites-Authorization']='Bearer '+cfg.transportToken;if(o===sites)h['OAI-Sites-Authorization']='Bearer '+cfg.sitesToken;if(o===transport||o===sites){const response=await r.fetch({headers:h,maxRedirects:0});await r.fulfill({response});}else await r.continue({headers:h});});contexts.push(c);return c;}
async function request(c,origin,path,data,status=200){const r=await c.request.fetch(origin+path,{method:data?'POST':'GET',maxRedirects:0,headers:{Origin:origin,'OAI-Sites-Authorization':'Bearer '+(origin===transport?cfg.transportToken:cfg.sitesToken),...(data?{'Content-Type':'application/json'}:{})},...(data?{data}:{})});assert.equal(r.status(),status,path);return r;}
try{for(const device of ['desktop','phone']){
 const viewport=device==='desktop'?{width:1280,height:900}:{width:390,height:844},f=cfg.fixtures.find(x=>x.device===device);assert.match(f.email,/^firmsaarthi\+qa-/);
 const c=await context(viewport);page=await c.newPage();page.setDefaultTimeout(30000);
 assert.equal((await(await request(c,transport,'/api/release')).json()).fingerprint,fingerprint);
 assert.equal((await(await request(c,sites,'/api/shared-account-release')).json()).fingerprint,cfg.sitesFingerprint);
 await request(c,transport,'/api/auth',{action:'login',email:f.email,password:cfg.password});
 await page.goto(transport+'/');
 if(device==='desktop'){
  await expect(page.getByRole('button',{name:'Settings',exact:true})).toBeVisible();await page.getByRole('button',{name:'Settings',exact:true}).click();
  const link=page.getByRole('link',{name:'Company website ↗',exact:true});await expect(link).toHaveAttribute('href',sites+'/api/auth/firmsaarthi/start');
  const next=c.waitForEvent('page');await link.click();page=await next;page.setDefaultTimeout(30000);
 }else await page.goto(sites+'/api/auth/firmsaarthi/start');
 await expect(page.getByText('Verify this email once to link your FirmSaarthi account. Future visits can use your Transport sign-in.',{exact:true})).toBeVisible();
 await expect(page.getByLabel('Email address',{exact:true})).toHaveValue(f.email);
 await page.getByRole('button',{name:'Send me a code →',exact:true}).click();await expect(page.getByLabel('6-digit email code',{exact:true})).toBeVisible();
 const consent=page.getByRole('checkbox');await expect(consent).not.toBeChecked();await expect(page.getByRole('button',{name:'Verify & continue →',exact:true})).toBeDisabled();
 console.log(JSON.stringify({mailNeeded:true,email:f.email,purpose:'Sites first link',codeNotLogged:true}));const code=await read();assert.match(code.code||'',/^\d{6}$/);
 await page.getByLabel('6-digit email code',{exact:true}).fill(code.code);await consent.check();await page.getByRole('button',{name:'Verify & continue →',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Your account',exact:true})).toBeVisible();const before=await(await request(c,sites,'/api/session')).json();assert.equal(before.user.email,f.email);assert.equal(before.admin,false);const mine=await(await request(c,sites,'/api/mine')).json();
 assert.deepEqual(await page.evaluate(()=>({width:innerWidth,height:innerHeight})),viewport);await page.screenshot({path:`outputs/shared-smoke/${device}-first-link.png`,fullPage:true});
 results.push({device,scenario:'first-link-otp-and-consent',status:'passed',measuredViewport:viewport,details:'Actual stage-to-stage signed exchange via owner-private QA relay, actual delivered-mail proof, unchecked explicit consent enforced, own synthetic Sites identity with no platform administrator role.'});
 await request(c,sites,'/api/auth/logout',{});await page.goto(sites+'/api/auth/firmsaarthi/start');await expect(page.getByRole('heading',{name:'Your account',exact:true})).toBeVisible();const after=await(await request(c,sites,'/api/session')).json();assert.equal(after.user.id,before.user.id);assert.equal(after.user.email,f.email);assert.deepEqual(await(await request(c,sites,'/api/mine')).json(),mine);
 results.push({device,scenario:'returning-shared-session',status:'passed',measuredViewport:viewport,details:'Normal Sites sign-out followed by fresh central handoff reuses same Sites owner and saved request list without another mailbox code.'});
 await request(c,transport,'/api/auth',{action:'logout'});assert.equal((await(await request(c,sites,'/api/session')).json()).user,null);
 results.push({device,scenario:'originating-transport-logout',status:'passed',measuredViewport:viewport,details:'Actual originating Transport sign-out invalidates the federated Sites session; this is not global logout of independent provider/product sessions.'});
 console.log(JSON.stringify({device,actualSharedSmoke:'passed'}));
 }
 writeFileSync('outputs/shared-smoke/results.json',JSON.stringify({status:'partial',transportFingerprint:fingerprint,sitesFingerprint:cfg.sitesFingerprint,transportVersionId:cfg.transportVersionId,transportDeploymentId:cfg.transportDeploymentId,sitesVersionId:cfg.sitesVersionId,sitesDeploymentId:cfg.sitesDeploymentId,networkMode:'owner-private in-memory QA relay',completedAt:new Date().toISOString(),results},null,2));
}catch(e){if(page)await page.screenshot({path:'outputs/shared-smoke/failure.png',fullPage:true}).catch(()=>{});console.log(JSON.stringify({failureOrigin:new URL(page.url()).origin,failurePath:new URL(page.url()).pathname}));writeFileSync('outputs/shared-smoke/failure.json',JSON.stringify({status:'failed',fingerprint,results,error:safe(e),at:new Date().toISOString()},null,2));console.log(safe(e));process.exitCode=1;}
finally{for(const c of contexts)await c.close().catch(()=>{});await browser.close();lines.close();}
