import {test} from 'vitest';
import assert from 'node:assert/strict';
import {apiFixture} from './helpers/api';
import {AuthService,cookieName} from '../lib/auth';
import {TransportService} from '../lib/service';
import {WorkspaceStagePolicies} from '../lib/workspace-stage-policy';
import {POST} from '../app/api/stage-policy/route';
import {workspaceFetch} from '../lib/workspace-sync';

const path='/api/stage-policy',required={version:1,placement:'accepted_file',loading:'accepted_file',arrival:'accepted_file'},optional={version:1,placement:'optional',loading:'optional',arrival:'optional'};
const save=(policy:unknown=required,version:unknown=0)=>({action:'save',policy,version});

test('successful stage saves refresh older reads; rejected saves do not replace a pending read',async()=>{
 const original=globalThis.fetch;
 try{for(const status of [200,409]){let finish:(r:Response)=>void=()=>{},reads=0;globalThis.fetch=(async(_input:RequestInfo|URL,init?:RequestInit)=>{if(init?.method==='POST')return Response.json({status},{status});reads++;return reads===1?new Promise<Response>(resolve=>{finish=resolve;}):Response.json({current:{version:2}});}) as typeof fetch;
  const pending=workspaceFetch(path);await workspaceFetch(path,{method:'POST',body:'{}'});finish(Response.json({current:{version:1}}));const data=await(await pending).json() as {current:{version:number}};assert.equal(reads,status===200?2:1);assert.equal(data.current.version,status===200?2:1);
 }}finally{globalThis.fetch=original;}
});

test('anonymous, foreign-origin and support sessions cannot read or mutate stage policy',async()=>{
 const f=await apiFixture();try{
  for(const body of [undefined,save()])assert.equal((await f.request(path,body,{cookie:''})).status,401);
  assert.equal((await f.request(path,save(),{origin:'https://untrusted.test'})).status,403);
  const support=f.getCookie()+'; logistrace_support=invalid';
  for(const body of [undefined,save()]){const r=await f.request(path,body,{cookie:support});assert.equal(r.status,403);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('x-content-type-options'),'nosniff');}
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM workspace_stage_policies').get()!.n,0);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit WHERE action='trip.stage-policy.save'").get()!.n,0);
 }finally{f.sqlite.close();}
});

test('owner saves append and return consistent current/history without retrofitting a default on read',async()=>{
 const f=await apiFixture();try{
  const initial=await(await f.request(path)).json() as any;assert.deepEqual(initial,{current:null,canManage:true,history:[]});
  const response=await f.request(path,save()),first=await response.json() as any;assert.equal(response.status,200);assert.equal(first.current.version,1);assert.deepEqual(first.current.policy,required);assert.equal(first.history.length,1);assert.equal(first.current.id,first.history[0].id);
  assert.equal((await f.request(path,save(optional,0))).status,409);assert.equal((await f.request(path,save(optional,1))).status,200);
  const state=await(await f.request(path)).json() as any;assert.equal(state.current.version,2);assert.deepEqual(state.current.policy,optional);assert.deepEqual(state.history[1].policy,required);assert.equal(state.history[0].id,state.current.id);assert.equal(state.history.length,2);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit WHERE action='trip.stage-policy.save'").get()!.n,2);
 }finally{f.sqlite.close();}
});

test('members and dispatchers receive only current policy and cannot save or obtain owner history',async()=>{
 const f=await apiFixture();try{const org=(await f.owner.member()).org_id;await new WorkspaceStagePolicies(f.owner).save(required,0);
  for(const role of ['MEMBER','DISPATCHER']){const id='stage-api-'+role,version='stage-api-token-'+role,email=role+'@stage-api.test';f.sqlite.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').run(id,org,email,role,'2026-10-27');f.sqlite.prepare('INSERT INTO password_accounts VALUES(?,?,?,?,0,?)').run(id,email,'google-only$synthetic',version,'2026-10-27');const cookie=cookieName()+'='+await new AuthService(f.db).issue(id,version),response=await f.request(path,undefined,{cookie}),data=await response.json() as any;
   assert.equal(response.status,200);assert.deepEqual(data.current.policy,required);assert.equal(data.canManage,false);assert.equal(Object.hasOwn(data,'history'),false);assert.equal(Object.hasOwn(data.current,'actor'),false);assert.equal((await f.request(path,save(optional,1),{cookie})).status,403);
  }assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM workspace_stage_policies').get()!.n,1);
 }finally{f.sqlite.close();}
});

test('foreign selectors are rejected and owner backup includes only own stage revision metadata',async()=>{
 const f=await apiFixture();try{const other=new TransportService(f.db,{userId:'stage-api-other',email:'other@stage-api.test'});await other.command('workspace.create',{name:'Other synthetic stage tenant'});const foreignService=new WorkspaceStagePolicies(other),foreign=await foreignService.save(required,0),org=(await other.member()).org_id;
  assert.equal((await f.request(path+'?orgId='+org)).status,400);assert.equal((await f.request(path,{...save(optional),orgId:org})).status,400);assert.equal((await f.request(path,{...save(optional),actor:'stage-api-other'})).status,400);
  assert.equal((await f.request(path,save(optional))).status,200);assert.equal((await foreignService.current())!.id,foreign.id);
  const backup=await f.owner.backup();assert.equal(backup.records.workspace_stage_policies.length,1);assert.equal(backup.records.workspace_stage_policies[0].org_id,(await f.owner.member()).org_id);assert.notEqual(backup.records.workspace_stage_policies[0].id,foreign.id);assert.equal(backup.records.workspace_stage_policies[0].loading_rule,'optional');
 }finally{f.sqlite.close();}
});

test('expired access and unavailable storage do not expose current or history',async()=>{
 const f=await apiFixture();try{const db=f.env.DB;delete f.env.DB;for(const body of [undefined,save()])assert.equal((await f.request(path,body)).status,503);f.env.DB=db;f.env.BILLING_ADMIN_USER_ID='different-platform-user';const org=(await f.owner.member()).org_id;f.sqlite.prepare('INSERT INTO subscriptions(org_id,trial_started_at,trial_ends_at) VALUES(?,?,?)').run(org,'2019-01-01T00:00:00.000Z','2019-02-01T00:00:00.000Z');
  for(const body of [undefined,save()]){const r=await f.request(path,body);assert.equal(r.status,402);const data=await r.json() as any;assert.equal(Object.hasOwn(data,'current'),false);assert.equal(Object.hasOwn(data,'history'),false);}assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM workspace_stage_policies').get()!.n,0);
 }finally{f.sqlite.close();}
});

test('strict JSON and real byte limits reject invalid, underspecified and streamed bodies without mutation',async()=>{
 const f=await apiFixture();try{
  for(const body of [null,[],{}, {action:'delete',policy:required,version:0},save({...required,placement:true}),{action:'save',policy:required}, {...save(),unexpected:1}])assert.equal((await f.request(path,body)).status,400);
  assert.equal((await f.request(path,save(required,'0'))).status,409);
  const headers={Origin:'https://local.test',Cookie:f.getCookie(),'Content-Type':'application/json'};
  assert.equal((await POST(new Request('https://local.test'+path,{method:'POST',headers,body:'{broken'}))).status,400);
  assert.equal((await POST(new Request('https://local.test'+path,{method:'POST',headers:{...headers,'Content-Type':'text/plain'},body:JSON.stringify(save())}))).status,415);
  assert.equal((await POST(new Request('https://local.test'+path,{method:'POST',headers:{...headers,'Content-Length':'1'},body:JSON.stringify({...save(),note:'é'.repeat(4500)})}))).status,413);
  let cancelled=false;const stream=new ReadableStream<Uint8Array>({pull(controller){controller.enqueue(new Uint8Array(4096).fill(32));},cancel(){cancelled=true;}});
  assert.equal((await POST(new Request('https://local.test'+path,{method:'POST',headers,body:stream,duplex:'half'} as RequestInit))).status,413);assert.equal(cancelled,true);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM workspace_stage_policies').get()!.n,0);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit WHERE action='trip.stage-policy.save'").get()!.n,0);
 }finally{f.sqlite.close();}
});

test('unexpected database errors return an opaque no-store response',async()=>{
 const f=await apiFixture();try{f.env.DB={prepare(){throw Error('Synthetic private database detail');}} as unknown as D1Database;
  for(const body of [undefined,save()]){const r=await f.request(path,body);assert.equal(r.status,500);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.doesNotMatch(await r.text(),/Synthetic private database detail/);}
 }finally{f.sqlite.close();}
});
