import {test,expect} from 'vitest';
import {database} from './helpers/database';
import {SiteService} from '../lib/site-service';

const now='2030-01-01T10:00:00.000Z';
function request(db:any, id:string, owner:string|null, email:string, status:string, options:{published?:string|null;trial?:string|null;paid?:string|null}={}){
  db.prepare(`INSERT INTO site_requests(id,token_hash,business,email,slug,domain_type,brief,status,created_at,updated_at,published_at,trial_ends_at,paid_until,owner_id)
    VALUES(?,?,?,?,?,'subdomain','{}',?,?,?,?,?,?,?)`).run(
      id,'token-'+id,'Business '+id,email,id.toLowerCase(),status,now,now,options.published??null,options.trial??null,options.paid??null,owner
    );
}

test('admin website roster reports account/profile/plan states and joins only by immutable owner id',async()=>{
  const {db,sqlite}=database();
  try{
    const owner='admin-user';
    sqlite.prepare('INSERT INTO site_users(id,email,name,created_at) VALUES(?,?,?,?)').run(owner,'admin-user@example.test','Admin user',now);
    sqlite.prepare('INSERT INTO site_users(id,email,name,created_at) VALUES(?,?,?,?)').run('free-user','free@example.test','Free user',now);
    sqlite.prepare('INSERT INTO site_users(id,email,name,created_at) VALUES(?,?,?,?)').run('paid-user','paid@example.test','Paid user',now);
    sqlite.prepare('INSERT INTO site_users(id,email,name,created_at) VALUES(?,?,?,?)').run('expired-user','expired@example.test','Expired user',now);
    sqlite.prepare('INSERT INTO site_users(id,email,name,created_at) VALUES(?,?,?,?)').run('suspended-user','suspended@example.test','Suspended user',now);
    sqlite.prepare('INSERT INTO site_users(id,email,name,created_at) VALUES(?,?,?,?)').run('draft-user','draft@example.test','Draft user',now);
    request(sqlite,'FREE-1','free-user','free@example.test','preview',{published:now,trial:'2030-01-04T10:00:00.000Z'});
    request(sqlite,'PAID-1','paid-user','paid@example.test','active',{published:now,paid:'2031-01-01T00:00:00.000Z'});
    request(sqlite,'EXPIRED-1','expired-user','expired@example.test','preview',{published:now,trial:'2029-12-31T00:00:00.000Z'});
    request(sqlite,'SUSPENDED-1','suspended-user','suspended@example.test','suspended',{published:now,trial:'2030-01-04T10:00:00.000Z'});
    request(sqlite,'DRAFT-1','draft-user','draft@example.test','submitted');
    // A legacy ownerless request with a matching email must not be attributed to the account.
    request(sqlite,'LEGACY-1',null,'admin-user@example.test','submitted');
    const service=new SiteService({DB:db,ADMIN_EMAIL:'admin@example.test'},new Request('https://sites.example.test/api',{headers:{'oai-authenticated-user-email':'admin@example.test','oai-authenticated-user-id':'authorized-admin'}}),fetch,()=>new Date(now));
    const result=await service.adminUsers(new URLSearchParams());
    expect(result.summary).toMatchObject({accounts:6,accounts_with_website:5,accounts_without_website:1,accounts_in_preview:1,accounts_with_paid_website:1,website_profiles:5,free_preview_websites:1,paid_websites:1});
    const byEmail=new Map(result.users.map((u:any)=>[u.email,u]));
    expect(byEmail.get('free@example.test')).toMatchObject({website_count:1,free_preview_count:1,account_status:'free_preview'});
    expect(byEmail.get('paid@example.test')).toMatchObject({website_count:1,paid_website_count:1,account_status:'paid'});
    expect(byEmail.get('expired@example.test')).toMatchObject({website_count:1,expired_website_count:1,account_status:'expired'});
    expect(byEmail.get('suspended@example.test')).toMatchObject({website_count:1,suspended_website_count:1,free_preview_count:0,account_status:'suspended'});
    expect(byEmail.get('draft@example.test')).toMatchObject({website_count:1,account_status:'profile_created'});
    expect(byEmail.get('admin-user@example.test')).toMatchObject({website_count:0,account_status:'no_website'});
    expect(result.users.every((u:any)=>!('id' in u)&&!('google_subject' in u)&&!('password_hash' in u))).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/LEGACY-1|token-LEGACY|admin_note|brief|payment_id|google_subject|password_hash/);
  }finally{sqlite.close();}
});

test('admin website roster supports search, status filtering and bounded pagination',async()=>{
  const {db,sqlite}=database();
  try{
    for(let i=0;i<55;i++)sqlite.prepare('INSERT INTO site_users(id,email,name,created_at) VALUES(?,?,?,?)').run('user-'+i,`user${String(i).padStart(2,'0')}@example.test`,`User ${i}`,new Date(Date.parse(now)+i).toISOString());
    const service=new SiteService({DB:db,ADMIN_EMAIL:'admin@example.test'},new Request('https://sites.example.test/api',{headers:{'oai-authenticated-user-email':'admin@example.test','oai-authenticated-user-id':'authorized-admin'}}),fetch,()=>new Date(now));
    const first=await service.adminUsers(new URLSearchParams({page:'1'}));
    const second=await service.adminUsers(new URLSearchParams({page:'2'}));
    expect(first.total).toBe(55);expect(first.users).toHaveLength(50);expect(second.users).toHaveLength(5);
    const filtered=await service.adminUsers(new URLSearchParams({q:'user54@EXAMPLE.test',status:'no_website'}));
    expect(filtered.total).toBe(1);expect(filtered.users[0].email).toBe('user54@example.test');
    const none=await service.adminUsers(new URLSearchParams({status:'paid'}));expect(none.total).toBe(0);
  }finally{sqlite.close();}
});

test('ordinary signed-in users cannot read the administrator website roster',async()=>{
  const {db,sqlite}=database();
  try{
    const service=new SiteService({DB:db,ADMIN_EMAIL:'admin@example.test'},new Request('https://sites.example.test/api',{headers:{'oai-authenticated-user-email':'member@example.test','oai-authenticated-user-id':'member'}}));
    await expect(service.adminUsers(new URLSearchParams())).rejects.toMatchObject({status:403});
    const missingId=new SiteService({DB:db,ADMIN_EMAIL:'admin@example.test'},new Request('https://sites.example.test/api',{headers:{'oai-authenticated-user-email':'admin@example.test'}}));
    await expect(missingId.adminUsers(new URLSearchParams())).rejects.toMatchObject({status:403});
  }finally{sqlite.close();}
});
