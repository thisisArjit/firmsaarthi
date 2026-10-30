import {test,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,readdirSync,rmSync,rmdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {AuthService,cookieName} from '../lib/auth';
import {GoogleAccountClaim} from '../lib/google-account-claim';
import {PasswordReset} from '../lib/password-reset';
import {verifyPassword} from '../lib/passwords';
const secret='ab'.repeat(32),fresh='Fresh concurrent synthetic password';
// Each emulated D1 transaction is synchronous, on independent connections to
// one file. This is local race evidence, never hosted D1 or provider evidence.
function connection(sqlite:DatabaseSync):D1Database{
 class S{args:any[]=[];constructor(public sql:string){}bind(...args:any[]){this.args=args;return this;}first(){return sqlite.prepare(this.sql).get(...this.args)||null;}all(){return {results:sqlite.prepare(this.sql).all(...this.args)};}run(){if(/\bRETURNING\b/i.test(this.sql)){const results=sqlite.prepare(this.sql).all(...this.args);return {success:true,results,meta:{changes:results.length}};}return {success:true,results:[],meta:{changes:sqlite.prepare(this.sql).run(...this.args).changes}};}}
 return {prepare:(sql:string)=>new S(sql),batch:async(statements:S[])=>{sqlite.exec('BEGIN IMMEDIATE');try{const r=statements.map(s=>s.run());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}} as unknown as D1Database;
}
for(const kind of ['identical','different-password','different-browser','ordinary-reset'])test(`independent-connection Google claim versus ${kind} has one atomic credential/link outcome`,async()=>{
 const directory=mkdtempSync(join(tmpdir(),'tms-claim-')),file=join(directory,'synthetic.sqlite'),a=new DatabaseSync(file),b=new DatabaseSync(file);
 try{
  a.exec('PRAGMA foreign_keys=ON');b.exec('PRAGMA foreign_keys=ON');for(const p of readdirSync('drizzle').filter(p=>p.endsWith('.sql')).sort())a.exec(readFileSync('drizzle/'+p,'utf8'));
  const one=connection(a),two=connection(b),auth=new AuthService(one),old=await auth.signup('race@synthetic.test','Old synthetic password','Same synthetic workspace','seed'),user=(await auth.user(cookieName()+'='+old))!,row=a.prepare('SELECT a.*,m.org_id,m.role FROM password_accounts a JOIN memberships m ON m.user_id=a.user_id').get() as any,mail:any[]=[],clock=()=>Date.parse('2026-10-30T00:00Z');
  const first=new GoogleAccountClaim(one,secret,async m=>{mail.push(m);},clock),second=new GoogleAccountClaim(two,secret,async()=>{},clock),session=await first.start({userId:user.userId,orgId:row.org_id,role:row.role,credentialVersion:row.credential_version,email:row.email,subject:'synthetic-concurrent-subject'}),requested=await first.request(session,'request'),verified=await first.verify(session,{...requested,ready:null},mail[0].code,'verify'),reset={...requested,ready:verified.resetToken};
  const competitor=kind==='ordinary-reset'?new PasswordReset(two,secret,async()=>{},clock).complete(requested.requestId,verified.resetToken,'Other explicit reset password',requested.proof,'reset'):second.complete(kind==='different-browser'?{...session,proof:'00'.repeat(32)}:session,reset,kind==='different-password'?'Other fresh concurrent password':fresh,true,undefined,'two');
  const results=await Promise.allSettled([first.complete(session,reset,fresh,true,undefined,'one'),competitor]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(kind==='identical'?2:1);
  expect(a.prepare('SELECT COUNT(*) n FROM organizations').get()).toMatchObject({n:1});expect(a.prepare('SELECT COUNT(*) n FROM memberships').get()).toMatchObject({n:1});
  expect(await auth.user(cookieName()+'='+old)).toBe(null);
  const claim=a.prepare('SELECT status FROM google_account_claims').get() as any,account=a.prepare('SELECT * FROM password_accounts').get() as any,linked=(a.prepare('SELECT COUNT(*) n FROM google_identities').get() as any).n,audits=(a.prepare("SELECT COUNT(*) n FROM audit WHERE action='account.google.email-claim'").get() as any).n;
  expect(linked).toBe(claim.status==='consumed'?1:0);expect(audits).toBe(linked);expect(a.prepare('SELECT status FROM password_reset_requests').get()).toMatchObject({status:'consumed'});
  if(kind!=='ordinary-reset')expect(claim.status).toBe('consumed');
  expect(await verifyPassword(linked?kind==='different-password'&&results[0].status==='rejected'?'Other fresh concurrent password':fresh:'Other explicit reset password',account.password_hash)).toBe(true);
 }finally{a.close();b.close();rmSync(file,{force:true});rmdirSync(directory);}
});
