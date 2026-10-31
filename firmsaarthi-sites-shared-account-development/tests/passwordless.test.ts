import {test,expect} from 'vitest';
import {database} from './helpers/database';
import {SiteService} from '../lib/site-service';
import {SiteAuth} from '../lib/site-auth';
const brief={business:'Fixture Studio',category:'Creative & portfolio',tagline:'',description:'We help local businesses with thoughtful design and friendly support.',contactName:'Fixture Owner',email:'owner@gmail.com',phone:'+91 9876543210',whatsapp:'',address:'',city:'Varanasi',state:'UP',postcode:'',hours:'',audience:'',goal:'Get enquiries',services:'',socials:'',color:'#2e7668',style:'studio',slug:'fixture-studio',domainType:'path',customDomain:'',sections:[{title:'About',content:'An independent studio for good ideas.'}],consent:true};
function fixture(){
 const {db,sqlite}=database();const state={now:new Date('2030-01-01T10:00:00Z')};let code='';const mails:any[]=[];
 const remote=(async(_url:unknown,init:any)=>{const mail=JSON.parse(init.body);mails.push(mail);const match=mail.text.match(/code is (\d{6})/);if(match)code=match[1];return Response.json({id:'fixture-mail'});}) as typeof fetch;
 const env={DB:db,RESEND_API_KEY:'fixture',MAIL_FROM:'no-reply@example.test'};
 const service=(cookie='')=>new SiteService(env,new Request('https://sites.example.test/api',{headers:{cookie}}),remote,()=>state.now);
 return {sqlite,service,state,mails,code:()=>code,auth:()=>new SiteAuth(service())};
}
test('email proof precedes account and request creation; one code submits an owned brief without a password',async()=>{const f=fixture();try{
 const auth=f.auth(),challenge=await auth.requestCode(brief.email,'access');
 expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM site_users').get()!.n).toBe(0);
 await expect(f.service().submit(brief)).rejects.toThrow(/Verify your email/);
 await expect(auth.verifyEmail({challenge:challenge.challenge,code:'wrong'})).rejects.toThrow(/6-digit/);
 expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM site_requests').get()!.n).toBe(0);
 const cookie=await auth.verifyEmail({challenge:challenge.challenge,code:f.code(),name:brief.contactName});const owner=f.service(cookie),user=await new SiteAuth(owner).user();
 const request=await owner.submit(brief);expect((await owner.mine()).requests[0].id).toBe(request.id);
 expect((await owner.submit(brief)).id).toBe(request.id);expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM site_requests').get()!.n).toBe(1);
 const stored=f.sqlite.prepare('SELECT * FROM site_requests WHERE id=?').get(request.id)!;expect(stored.owner_id).toBe(user!.id);expect(stored.status).toBe('submitted');expect(stored.published_at).toBeNull();
 expect(f.sqlite.prepare('SELECT password_hash FROM site_users').get()!.password_hash).toBeNull();
 expect(f.mails.some(m=>m.to.includes(brief.email)&&m.text.includes('We will email you the link once it is live'))).toBe(true);
 await expect(auth.verifyEmail({challenge:challenge.challenge,code:f.code()})).rejects.toThrow(/expired/);
}finally{f.sqlite.close();}});
test('returning email verification reuses the same user, websites and optional password',async()=>{const f=fixture();try{
 const a=f.auth(),first=await a.requestCode(brief.email,'access'),cookie=await a.verifyEmail({challenge:first.challenge,code:f.code(),name:brief.contactName});const owner=f.service(cookie),submitted=await owner.submit(brief),id=(await new SiteAuth(owner).user())!.id;
 const reset=await a.requestCode(brief.email,'reset');await a.reset({challenge:reset.challenge,code:f.code(),password:'Optional example password'});
 const next=await a.requestCode(brief.email.toUpperCase(),'access'),again=await a.verifyEmail({challenge:next.challenge,code:f.code(),name:'Must not overwrite the account'});const returning=f.service(again);
 expect((await new SiteAuth(returning).user())!.id).toBe(id);expect((await returning.mine()).requests.map(r=>r.id)).toEqual([submitted.id]);expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM site_users').get()!.n).toBe(1);expect(f.sqlite.prepare('SELECT name FROM site_users').get()!.name).toBe(brief.contactName);
 expect(await a.login({email:brief.email,password:'Optional example password'})).toContain('HttpOnly');
}finally{f.sqlite.close();}});
test('resending invalidates the previous code; expired and wrong-purpose codes cannot create users',async()=>{const f=fixture();try{
 const a=f.auth(),old=await a.requestCode(brief.email,'access'),oldCode=f.code(),fresh=await a.requestCode(brief.email,'access'),freshCode=f.code();
 await expect(a.verifyEmail({challenge:old.challenge,code:oldCode})).rejects.toThrow(/expired/);
 const signup=await a.requestCode('different@example.test','signup');await expect(a.verifyEmail({challenge:signup.challenge,code:f.code()})).rejects.toThrow(/expired/);
 f.state.now=new Date('2030-01-01T10:11:00Z');await expect(a.verifyEmail({challenge:fresh.challenge,code:freshCode})).rejects.toThrow(/expired/);expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM site_users').get()!.n).toBe(0);
}finally{f.sqlite.close();}});
test('Google Gmail sign-in reuses the OTP owner and all its websites',async()=>{const f=fixture();try{
 const a=f.auth(),challenge=await a.requestCode(brief.email,'access'),cookie=await a.verifyEmail({challenge:challenge.challenge,code:f.code()});const owner=f.service(cookie),r=await owner.submit(brief),id=(await new SiteAuth(owner).user())!.id;
 const googleCookie=await a.completeIdentity({},'google-fixture',brief.email,'Owner');const google=f.service(googleCookie);expect((await new SiteAuth(google).user())!.id).toBe(id);expect((await google.mine()).requests[0].id).toBe(r.id);expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM site_users').get()!.n).toBe(1);
 await expect(a.completeIdentity({},'different-google',brief.email,'Stranger')).rejects.toThrow(/different Google/);
}finally{f.sqlite.close();}});
test('non-Gmail Google linking requires matching email proof, is browser-bound, and works on later sign-ins',async()=>{const f=fixture();try{
 const email='owner@business.test',a=f.auth();a.returnTo='/account';expect(await a.completeIdentity({},'google-business',email,'Business Owner')).toBe('');expect(a.linkCookie).toContain('HttpOnly');expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM site_users').get()!.n).toBe(0);
 const challenge=await a.requestCode(email,'access'),browser=new SiteAuth(f.service(a.linkCookie));const cookie=await browser.verifyEmail({challenge:challenge.challenge,code:f.code()});const user=await new SiteAuth(f.service(cookie)).user();expect(user!.googleLinked).toBe(true);
 const next=await f.auth().completeIdentity({},'google-business',email,'Business Owner');expect((await new SiteAuth(f.service(next)).user())!.id).toBe(user!.id);
}finally{f.sqlite.close();}});
test('an OTP for another email cannot claim a pending Google identity or somebody else’s request',async()=>{const f=fixture();try{
 const a=f.auth();await a.completeIdentity({},'google-target','target@business.test','Target');const proof=await a.requestCode('stranger@example.test','access'),other=new SiteAuth(f.service(a.linkCookie));const cookie=await other.verifyEmail({challenge:proof.challenge,code:f.code()});expect((await new SiteAuth(f.service(cookie)).user())!.googleLinked).toBe(false);
 await expect(f.service(cookie).submit(brief)).rejects.toThrow(/verified account email/);expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM site_requests').get()!.n).toBe(0);expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM site_identity_links').get()!.n).toBe(1);
}finally{f.sqlite.close();}});
