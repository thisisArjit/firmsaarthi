import {test} from 'vitest';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync,rmdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {database} from './helpers/database';
import {AuthService,cookieName} from '../lib/auth';
import {GoogleAuth} from '../lib/google-auth';
import {PasswordReset} from '../lib/password-reset';
import {randomToken,verifyPassword} from '../lib/passwords';
import {SignupEmailProof,validateSignupPassword,type SignupMail} from '../lib/signup-email-proof';

const secret='ab'.repeat(32),password='Synthetic passphrase 2026',name='Synthetic verified transport';
function fixture(){
 const {db,sqlite}=database(),mail:SignupMail[]=[];let now=Date.parse('2026-10-29T00:00:00Z');
 const clock=()=>now,signup=new SignupEmailProof(db,secret,async m=>{mail.push(m);},clock);
 return {db,sqlite,mail,signup,clock,advance:(n:number)=>{now+=n*1000;}};
}
async function ready(f:ReturnType<typeof fixture>,email='owner@synthetic.test'){
 const requested=await f.signup.request(email,'request-ip'),verified=await f.signup.verify(requested.requestId,f.mail.at(-1)!.code,requested.proof,'verify-ip');return {...requested,...verified};
}
test('mailbox proof creates no account or membership before verification and stores no raw code/browser/token',async()=>{
 const f=fixture();try{
  const r=await f.signup.request(' OWNER@synthetic.test ','ip');assert.equal(f.mail[0].to,'owner@synthetic.test');assert.match(f.mail[0].code,/^\d{6}$/);
  for(const table of ['password_accounts','organizations','memberships','auth_sessions','account_email_proofs'])assert.equal(f.sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get()!.n,0);
  const row=f.sqlite.prepare('SELECT * FROM signup_email_proofs').get()!;assert.notEqual(row.id,r.requestId);assert.notEqual(row.code_hash,f.mail[0].code);assert.notEqual(row.browser_hash,r.proof);assert.equal(row.registration_hash,null);
  const v=await f.signup.verify(r.requestId,f.mail[0].code,r.proof,'verify');assert.notEqual(f.sqlite.prepare('SELECT registration_hash FROM signup_email_proofs').get()!.registration_hash,v.registrationToken);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM password_accounts').get()!.n,0);await assert.rejects(f.signup.verify(r.requestId,f.mail[0].code,r.proof,'replay'));
 }finally{f.sqlite.close();}
});
test('verified completion atomically creates one owner workspace and exact same-payload recovery receipt',async()=>{
 const f=fixture();try{
  const r=await ready(f),created=await f.signup.complete(r.requestId,r.registrationToken,password,name,r.proof,'complete');assert.equal(created.alreadyCreated,false);
  const again=await f.signup.complete(r.requestId,r.registrationToken,password,name,r.proof,'replay');assert.equal(again.alreadyCreated,true);assert.equal(again.userId,created.userId);assert.equal(again.orgId,created.orgId);
  for(const table of ['password_accounts','organizations','memberships','account_email_proofs'])assert.equal(f.sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get()!.n,1);
  const account=f.sqlite.prepare('SELECT * FROM password_accounts').get()!,member=f.sqlite.prepare('SELECT * FROM memberships').get()!,proof=f.sqlite.prepare('SELECT * FROM account_email_proofs').get()!;
  assert.equal(member.role,'OWNER');assert.equal(member.org_id,created.orgId);assert.equal(proof.method,'signup_email_otp');assert.equal(proof.credential_version,account.credential_version);assert.ok(await verifyPassword(password,account.password_hash as string));
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit WHERE action='account.verified-signup'").get()!.n,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get()!.n,0);
  const auth=new AuthService(f.db),session=await auth.issue(created.userId,created.credentialVersion);assert.equal((await auth.user(cookieName()+'='+session))!.userId,created.userId);
  await assert.rejects(f.signup.complete(r.requestId,r.registrationToken,'Different passphrase 2026',name,r.proof,'changed-password'),/different details/);
  await assert.rejects(f.signup.complete(r.requestId,r.registrationToken,password,'Other business',r.proof,'changed-name'),/different details/);
 }finally{f.sqlite.close();}
});
test('proof, verified capability and expiry cannot be transferred between browser or request',async()=>{
 const f=fixture();try{
  const r=await f.signup.request('one@synthetic.test','r');await assert.rejects(f.signup.verify(r.requestId,f.mail[0].code,randomToken(),'other-browser'));assert.equal(f.sqlite.prepare('SELECT attempts FROM signup_email_proofs').get()!.attempts,0);
  const v=await f.signup.verify(r.requestId,f.mail[0].code,r.proof,'v');await assert.rejects(f.signup.complete(r.requestId,v.registrationToken,password,name,randomToken(),'wrong-browser'));
  await assert.rejects(f.signup.complete(randomToken(),v.registrationToken,password,name,r.proof,'wrong-request'));
  f.advance(301);await assert.rejects(f.signup.complete(r.requestId,v.registrationToken,password,name,r.proof,'expired'));assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM organizations').get()!.n,0);
 }finally{f.sqlite.close();}
});
test('codes expire after ten minutes and five wrong attempts cannot be followed by a correct code',async()=>{
 const f=fixture();try{
  const r=await f.signup.request('one@synthetic.test','r'),correct=f.mail[0].code,wrong=correct==='000000'?'111111':'000000';for(let i=0;i<5;i++)await assert.rejects(f.signup.verify(r.requestId,wrong,r.proof,'v'));
  await assert.rejects(f.signup.verify(r.requestId,correct,r.proof,'v'));assert.equal(f.sqlite.prepare('SELECT attempts FROM signup_email_proofs').get()!.attempts,5);
  const next=await f.signup.request('two@synthetic.test','r2');f.advance(601);await assert.rejects(f.signup.verify(next.requestId,f.mail[1].code,next.proof,'expired'));
 }finally{f.sqlite.close();}
});
test('existing, disabled and failed-delivery requests stay generic and never change a credential or session',async()=>{
 const f=fixture();try{
  const auth=new AuthService(f.db),session=await auth.signup('existing@synthetic.test','Eight123','Synthetic existing','old'),account=f.sqlite.prepare('SELECT * FROM password_accounts').get()!;
  const existing=await f.signup.request('existing@synthetic.test','r');assert.equal(f.mail.length,0);assert.equal(await auth.user(cookieName()+'='+session)!==null,true);
  f.sqlite.prepare('UPDATE password_accounts SET disabled=1').run();f.advance(61);const disabled=await f.signup.request('existing@synthetic.test','r2');assert.equal(disabled.message,existing.message);assert.equal(f.mail.length,0);assert.equal(f.sqlite.prepare('SELECT password_hash FROM password_accounts').get()!.password_hash,account.password_hash);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get()!.n,1);
  const failing=new SignupEmailProof(f.db,secret,async()=>{throw Error('Synthetic provider failure');},f.clock),fail=await failing.request('new@synthetic.test','fail');assert.equal(fail.message,existing.message);await assert.rejects(failing.verify(fail.requestId,'000000',fail.proof,'v'));
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM password_accounts').get()!.n,1);
 }finally{f.sqlite.close();}
});
test('signup and existing password reset consume one shared daily delivery budget',async()=>{
 const f=fixture();try{
  const signup=new SignupEmailProof(f.db,secret,async()=>{},f.clock,2),reset=new PasswordReset(f.db,secret,async()=>{},f.clock,2);
  await reset.request('missing@synthetic.test','reset');await signup.request('new@synthetic.test','signup');await assert.rejects(reset.request('other@synthetic.test','reset2'),/Too many reset/);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM auth_limits WHERE key LIKE 'reset:delivery-budget:%'").get()!.n,1);
 }finally{f.sqlite.close();}
});
test('invalid secret or budget cannot send mail, and reset capabilities cannot authorize registration',async()=>{
 const f=fixture();try{
  for(const budget of [0,-1,NaN,Infinity,71])assert.throws(()=>new SignupEmailProof(f.db,secret,async()=>{},f.clock,budget));
  const unavailable=new SignupEmailProof(f.db,'invalid',async()=>{throw Error('must not send');},f.clock);await assert.rejects(unavailable.request('one@synthetic.test','r'),/temporarily unavailable/);
  const reset=new PasswordReset(f.db,secret,async()=>{},f.clock),r=await reset.request('missing@synthetic.test','reset');await assert.rejects(f.signup.verify(r.requestId,'123456',r.proof,'verify'));
  await assert.rejects(f.signup.complete(r.requestId,randomToken(),password,name,r.proof,'complete'));assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM organizations').get()!.n,0);
 }finally{f.sqlite.close();}
});
test('cooldown and per-address/IP limits apply without invalidating another browser existing proof',async()=>{
 const f=fixture();try{
  const first=await f.signup.request('one@synthetic.test','r');await assert.rejects(f.signup.request('one@synthetic.test','r2'),/one minute/);
  f.advance(61);await f.signup.request('one@synthetic.test','r3');await f.signup.verify(first.requestId,f.mail[0].code,first.proof,'owner');f.advance(61);await assert.rejects(f.signup.request('one@synthetic.test','r4'),/Too many/);
 }finally{f.sqlite.close();}
});
for(const provider of ['password','google'])test(`a ${provider} account created while proof is pending cannot be claimed or merged`,async()=>{
 const f=fixture();try{
  const r=await ready(f),auth=new AuthService(f.db),oldSession=provider==='password'?await auth.signup('owner@synthetic.test','Eight123','Synthetic concurrent existing','old'):await new GoogleAuth(f.db,{clientId:'synthetic-client',clientSecret:'synthetic-secret',redirectUri:'https://local.test/api/auth/google/callback'}).complete({intent:'signup',business_name:'Synthetic Google existing'},{subject:'synthetic-google-subject',email:'owner@synthetic.test'},null);const before=f.sqlite.prepare('SELECT * FROM password_accounts').get()!;
  await assert.rejects(f.signup.complete(r.requestId,r.registrationToken,password,name,r.proof,'complete'),/Unable to create/);
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM password_accounts').get(),before);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM organizations').get()!.n,1);assert.ok(await auth.user(cookieName()+'='+oldSession));assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM account_email_proofs').get()!.n,0);
 }finally{f.sqlite.close();}
});
test('registration-audit failure rolls back proof consumption, account, workspace, membership and evidence together',async()=>{
 const f=fixture();try{
  const r=await ready(f);f.sqlite.exec("CREATE TRIGGER fail_signup BEFORE INSERT ON audit WHEN NEW.action='account.verified-signup' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END");
  await assert.rejects(f.signup.complete(r.requestId,r.registrationToken,password,name,r.proof,'complete'));assert.equal(f.sqlite.prepare('SELECT status FROM signup_email_proofs').get()!.status,'verified');
  for(const table of ['organizations','password_accounts','memberships','account_email_proofs'])assert.equal(f.sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get()!.n,0);
  f.sqlite.exec('DROP TRIGGER fail_signup');assert.equal((await f.signup.complete(r.requestId,r.registrationToken,password,name,r.proof,'retry')).alreadyCreated,false);
 }finally{f.sqlite.close();}
});
for(const change of ['disabled','credential','membership'])test(`same-intent recovery cannot restore an account after ${change} change`,async()=>{
 const f=fixture();try{
  const r=await ready(f);await f.signup.complete(r.requestId,r.registrationToken,password,name,r.proof,'complete');
  if(change==='disabled')f.sqlite.prepare('UPDATE password_accounts SET disabled=1').run();else if(change==='credential')f.sqlite.prepare("UPDATE password_accounts SET credential_version='changed'").run();else f.sqlite.prepare("UPDATE memberships SET role='MEMBER'").run();
  const before=f.sqlite.prepare('SELECT * FROM password_accounts').get();await assert.rejects(f.signup.complete(r.requestId,r.registrationToken,password,name,r.proof,'replay'));assert.deepEqual(f.sqlite.prepare('SELECT * FROM password_accounts').get(),before);
 }finally{f.sqlite.close();}
});
test('new-account policy counts Unicode code points; existing eight-character passwords remain usable',async()=>{
 assert.throws(()=>validateSignupPassword('Eight123'));assert.throws(()=>validateSignupPassword('😀'.repeat(8)));validateSignupPassword('😀'.repeat(15));validateSignupPassword('x'.repeat(15));assert.throws(()=>validateSignupPassword('x'.repeat(129)));
 const f=fixture();try{const auth=new AuthService(f.db);await auth.signup('legacy@synthetic.test','Eight123','Synthetic existing','r');await auth.login('legacy@synthetic.test','Eight123','l');}finally{f.sqlite.close();}
});
test('additive enrollment migration preserves populated accounts and does not invent legacy verification',async()=>{
 const f=database('0037_signup_email_proof.sql');try{
  const auth=new AuthService(f.db);await auth.signup('old@synthetic.test','Eight123','Synthetic old','r');const before=f.sqlite.prepare('SELECT * FROM password_accounts').all(),sessions=f.sqlite.prepare('SELECT * FROM auth_sessions').all();f.sqlite.exec(readFileSync('drizzle/0037_signup_email_proof.sql','utf8'));
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM password_accounts').all(),before);assert.deepEqual(f.sqlite.prepare('SELECT * FROM auth_sessions').all(),sessions);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM account_email_proofs').get()!.n,0);
 }finally{f.sqlite.close();}
});

// Synchronous statements make each emulated D1 batch atomic. Separate physical
// SQLite connections see the same file; both service calls race after the
// asynchronous hash, exercising guards beyond a single-connection mock.
function connection(sqlite:DatabaseSync):D1Database{
 class S{args:any[]=[];constructor(public sql:string){}bind(...args:any[]){this.args=args;return this;}first(){return sqlite.prepare(this.sql).get(...this.args)||null;}all(){return {results:sqlite.prepare(this.sql).all(...this.args)};}run(){if(/\bRETURNING\b/i.test(this.sql)){const results=sqlite.prepare(this.sql).all(...this.args);return {success:true,results,meta:{changes:results.length}};}return {success:true,results:[],meta:{changes:sqlite.prepare(this.sql).run(...this.args).changes}};}}
 return {prepare:(sql:string)=>new S(sql),batch:async(statements:S[])=>{sqlite.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>s.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}} as unknown as D1Database;
}
for(const kind of ['identical','different-payload','different-request'])test(`independent-connection ${kind} concurrent completion creates one account without orphan organizations`,async()=>{
 const directory=mkdtempSync(join(tmpdir(),'tms-signup-')),file=join(directory,'synthetic.sqlite'),a=new DatabaseSync(file),b=new DatabaseSync(file);
 try{
  a.exec('PRAGMA foreign_keys=ON');b.exec('PRAGMA foreign_keys=ON');const migrations=await import('node:fs');for(const p of migrations.readdirSync('drizzle').filter(p=>p.endsWith('.sql')).sort())a.exec(readFileSync('drizzle/'+p,'utf8'));
  let now=Date.parse('2026-10-29T00:00:00Z');const clock=()=>now,mail:SignupMail[]=[],one=new SignupEmailProof(connection(a),secret,async m=>{mail.push(m);},clock),two=new SignupEmailProof(connection(b),secret,async()=>{},clock);
  const r=await one.request('race@synthetic.test','r'),v=await one.verify(r.requestId,mail[0].code,r.proof,'v');let other={...r,...v};
  if(kind==='different-request'){now+=61000;const next=await one.request('race@synthetic.test','r2');other={...next,...await one.verify(next.requestId,mail[1].code,next.proof,'v2')};}
  const results=await Promise.allSettled([one.complete(r.requestId,v.registrationToken,password,name,r.proof,'one'),two.complete(other.requestId,other.registrationToken,kind==='different-payload'?'Other passphrase 2026':password,name,other.proof,'two')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,kind==='identical'?2:1);
  for(const table of ['organizations','password_accounts','memberships','account_email_proofs'])assert.equal(a.prepare(`SELECT COUNT(*) n FROM ${table}`).get()!.n,1);
  assert.equal(a.prepare("SELECT COUNT(*) n FROM signup_email_proofs WHERE status='consumed'").get()!.n,1);assert.equal(a.prepare("SELECT COUNT(*) n FROM audit WHERE action='account.verified-signup'").get()!.n,1);
 }finally{a.close();b.close();rmSync(file,{force:true});rmdirSync(directory);}
});
