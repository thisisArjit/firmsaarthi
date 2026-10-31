import {DatabaseSync} from 'node:sqlite';import {readdirSync,readFileSync} from 'node:fs';import {join} from 'node:path';import {randomBytes,createHash} from 'node:crypto';import assert from 'node:assert/strict';
const origin='http://127.0.0.1:5173';
// Each smoke assertion uses an isolated HTTP connection so unread error bodies
// cannot block a later request. Failures include their route for diagnosis.
const nativeFetch=globalThis.fetch;
async function fetch(url,options={}){try{return await nativeFetch(url,{...options,headers:{...options.headers,Connection:'close'},signal:AbortSignal.timeout(20000)});}catch(error){console.error('HTTP smoke failed at '+url);throw error;}}
function find(path){for(const e of readdirSync(path,{withFileTypes:true})){const p=join(path,e.name);if(e.isDirectory()){const found=find(p);if(found)return found;}else if(e.name.endsWith('.sqlite'))return p;}}
const sqlite=new DatabaseSync(find('.wrangler/state/v3/d1'));sqlite.exec('PRAGMA busy_timeout=5000');
const user='qa-'+randomBytes(5).toString('hex'),token=randomBytes(32).toString('hex'),email=user+'@example.test',hash=createHash('sha256').update(token).digest('hex');
sqlite.prepare('INSERT INTO site_users(id,email,name,created_at) VALUES (?,?,?,?)').run(user,email,'Local QA Owner',new Date().toISOString());sqlite.prepare('INSERT INTO site_sessions(token_hash,user_id,expires_at) VALUES (?,?,?)').run(hash,user,new Date(Date.now()+86400000).toISOString());
const qaIp='192.0.2.'+(randomBytes(1)[0]%200+1);
const cookie='fs_sites_session='+token,admin={'oai-authenticated-user-email':'qa-operator@example.test','oai-authenticated-user-id':'qa-operator'};let checks=0;
async function request(path,body,extra={}){return fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,cookie,'cf-connecting-ip':qaIp,...(body instanceof FormData?{}:{'Content-Type':'application/json'}),...extra},...(body!==undefined?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});}
const brief={business:'Local QA Workshop',category:'Creative & portfolio',tagline:'A local test website',description:'Synthetic website used to test the complete request journey without sending emails or taking payments.',contactName:'Local QA Owner',email,phone:'+91 9876543210',whatsapp:'',city:'Varanasi',address:'',state:'',postcode:'',hours:'',audience:'',goal:'Get enquiries',services:'Design\nConsulting',socials:'',color:'#2e7668',style:'studio',slug:user,domainType:'path',customDomain:'',sections:[{title:'About us',content:'Helpful local work. <script>test-only</script>'}],consent:true};
try{
  let response=await request('/api/requests',brief);assert.equal(response.status,200);const created=await response.json();checks++;
  response=await request('/api/requests/'+created.id);let detail=await response.json();assert.equal(detail.business,brief.business);assert.equal(detail.assets.length,0);checks++;
  response=await fetch(origin+'/api/requests/'+created.id);assert.equal(response.status,404);checks++;
  const form=new FormData();form.append('file',new File([readFileSync('public/firmsaarthi-logo.png')],'qa-logo.png',{type:'image/png'}));form.append('kind','logo');response=await request('/api/requests/'+created.id+'/assets',form);assert.equal(response.status,200);const asset=await response.json();checks++;
  response=await fetch(origin+'/api/assets/'+asset.id);assert.equal(response.status,404);checks++;
  response=await request('/api/requests/'+created.id+'/manage',{action:'publish',version:detail.version},admin);assert.equal(response.status,200);detail=await response.json();assert.equal(detail.access,'preview');checks++;
  response=await fetch(origin+'/w/'+user);let html=await response.text();assert.equal(response.status,200);assert.ok(html.includes(brief.business));assert.ok(html.includes('&lt;script&gt;test-only&lt;/script&gt;'));assert.ok(html.includes('section-0'));checks++;
  response=await fetch(origin+'/api/assets/'+asset.id);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');checks++;
  response=await request('/api/requests/'+created.id+'/update',{version:detail.version,brief:{...brief,tagline:'A saved customer change'}});assert.equal(response.status,200);let edited=await response.json();assert.equal(edited.trialEndsAt,detail.trialEndsAt);checks++;
  response=await request('/api/requests/'+created.id+'/update',{version:detail.version,brief});assert.equal(response.status,409);checks++;
  response=await request('/api/requests/'+created.id+'/order',{});assert.equal(response.status,503);checks++;
  response=await request('/api/requests/'+created.id+'/manage',{action:'suspend',version:edited.version},admin);assert.equal(response.status,200);await response.json();
  response=await fetch(origin+'/w/'+user);assert.equal(response.status,410);response=await request('/api/requests/'+created.id);detail=await response.json();assert.equal(detail.access,'suspended');assert.equal(detail.brief.tagline,'A saved customer change');checks++;
  response=await fetch(origin+'/api/assets/'+asset.id);assert.equal(response.status,404);checks++;
  response=await request('/api/requests/'+created.id+'/assets/remove',{assetId:asset.id});assert.equal(response.status,200);checks++;
  response=await request('/api/auth/logout',{});assert.equal(response.status,200);assert.ok(response.headers.get('set-cookie').includes('Max-Age=0'));response=await request('/api/mine');assert.equal(response.status,401);checks++;
  console.log(JSON.stringify({passed:true,checks,scope:'Synthetic local HTTP lifecycle; no live email or payment'}));
}finally{if(sqlite.isOpen)sqlite.close();}
