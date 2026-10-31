import {test,expect} from 'vitest';
import {database} from './helpers/database';
import {SiteService} from '../lib/site-service';
import {digest,DAY} from '../lib/site-domain';
const brief={business:'Mitti Bakery',category:'Food & café',contactName:'Owner',email:'owner@example.test',phone:'+91 9876543210',city:'Patna',slug:'instant-mitti',domainType:'path',description:'We bake custom eggless birthday cakes in Patna.',sections:[{title:'About us',content:'Custom eggless birthday cakes in Patna.'},{title:'Our cakes',content:'Contact us to discuss your cake.'}],consent:true};
test('verified owner launches a complete website instantly, retains ownership and cannot restart the trial',async()=>{
 const {sqlite,db}=database();try{
  const token='a'.repeat(64),time=new Date('2030-01-01T12:00:00Z');
  sqlite.prepare('INSERT INTO site_users(id,email,name,created_at) VALUES (?,?,?,?)').run('owner',brief.email,'Owner',time.toISOString());sqlite.prepare('INSERT INTO site_sessions VALUES (?,?,?)').run(await digest(token),'owner','2040-01-01');
  const s=new SiteService({DB:db},new Request('https://sites.example.test',{headers:{cookie:'__Host-fs_sites_session='+token}}),fetch,()=>time);
  const created=await s.submit(brief),result=await s.launch(created.id);expect(result.access).toBe('preview');expect(Date.parse(result.trialEndsAt)-Date.parse(result.publishedAt)).toBe(3*DAY);expect((await s.mine()).requests[0].id).toBe(created.id);expect((await s.publicSite(brief.slug))!.brief.description).toBe(brief.description);
  s.clock=()=>new Date(time.getTime()+2*DAY);const repeated=await s.launch(created.id);expect(repeated.trialEndsAt).toBe(result.trialEndsAt);expect(repeated.version).toBe(result.version);
  const anonymous=new SiteService({DB:db},new Request('https://sites.example.test',{headers:{Authorization:'Bearer '+created.token}}));await expect(anonymous.launch(created.id)).rejects.toMatchObject({status:401});
  const admin=new SiteService({DB:db,ADMIN_EMAIL:'admin@example.test'},new Request('https://sites.example.test',{headers:{'oai-authenticated-user-email':'admin@example.test','oai-authenticated-user-id':'admin'}}),fetch,()=>time);
  sqlite.prepare('INSERT INTO site_assets(id,request_id,object_key,type,name,size,kind,created_at) VALUES (?,?,?,?,?,?,?,?)').run('logo',created.id,'logo','image/png','logo.png',100,'logo',time.toISOString());
  const final=await admin.update(created.id,{action:'publish',version:result.version});expect(final.trialEndsAt).toBe(result.trialEndsAt);
  const ready=sqlite.prepare("SELECT body FROM site_outbox WHERE id=?").get('instant-ready-'+created.id);expect(ready!.body).toContain('https://www.firmsaarthi.com/'+brief.slug);
 }finally{sqlite.close();}
});
test('managed and custom domains cannot use instant launch, and suspended sites stay offline',async()=>{
 const {sqlite,db}=database();try{
  const token='a'.repeat(64);sqlite.prepare('INSERT INTO site_users(id,email,name,created_at) VALUES (?,?,?,?)').run('owner',brief.email,'Owner','2030-01-01');sqlite.prepare('INSERT INTO site_sessions VALUES (?,?,?)').run(await digest(token),'owner','2040-01-01');
  const s=new SiteService({DB:db},new Request('https://sites.example.test',{headers:{cookie:'__Host-fs_sites_session='+token}}));
  for(const domainType of ['subdomain','custom']){const request=await s.submit({...brief,slug:domainType,domainType});await expect(s.launch(request.id)).rejects.toMatchObject({status:409});expect((await s.detail(request.id)).publishedAt).toBeNull();}
  const request=await s.submit({...brief,slug:'suspended'});sqlite.prepare("UPDATE site_requests SET status='suspended' WHERE id=?").run(request.id);await expect(s.launch(request.id)).rejects.toThrow(/restore/);expect(await s.publicSite('suspended')).toBeNull();
 }finally{sqlite.close();}
});
