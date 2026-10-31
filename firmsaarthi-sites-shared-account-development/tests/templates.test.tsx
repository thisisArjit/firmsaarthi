import {test,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {database} from './helpers/database';
import {SiteService} from '../lib/site-service';
import {digest,validateBrief,publicBrief} from '../lib/site-domain';
import {TEMPLATES,resolveStyle} from '../lib/templates';
import {WebsiteTemplate} from '../app/website-template';
const base={business:'Mitti Bakery',category:'Food & café',contactName:'Bakery Owner',email:'owner@example.test',phone:'+91 9876543210',city:'Patna',slug:'mitti-bakery',domainType:'path',description:'We bake custom birthday cakes and eggless desserts in Patna.',sections:[{title:'About us',content:'Custom cakes for local celebrations.'},{title:'Our cakes',content:'Birthday cakes and eggless desserts.'}],consent:true,style:'cafe'};
test('customer text is required and removed generation preferences are not saved',()=>{
 const brief=validateBrief({...base,copyChoice:'ai',logoChoice:'ai',imageChoice:'ai',offeringBrief:'old draft',visualNotes:'old preference'});
 for(const key of ['copyChoice','logoChoice','imageChoice','offeringBrief','visualNotes'])expect(brief).not.toHaveProperty(key);
 expect(brief.description).toBe(base.description);const visible=publicBrief(brief);expect(visible.style).toBe('cafe');expect(visible).not.toHaveProperty('email');
 for(const change of [{description:''},{sections:[{title:'About us',content:''}]},{style:'invented'},{style:'auto'}])expect(()=>validateBrief({...base,...change})).toThrow();
});
test('four original templates render the same user content, uploads and dynamic section tabs',()=>{
 const brief=validateBrief({...base,description:'We make custom cakes and eggless desserts for local celebrations.',sections:[{title:'Our cakes',content:'Cakes for celebrations.'},{title:'Delivery & pickup',content:'Contact us to discuss collection.'}]});
 for(const template of TEMPLATES){const html=renderToStaticMarkup(<WebsiteTemplate brief={publicBrief({...brief,style:template.id})} logo="/api/assets/test-logo" photos={['/api/assets/test-photo']}/>);expect(html).toContain('theme-'+template.id);expect(html).toContain('Mitti Bakery');expect(html).toContain('src="/api/assets/test-logo"');expect(html).toContain('src="/api/assets/test-photo"');expect(html).toContain('href="#section-1"');expect(html).toContain('Delivery &amp; pickup');expect(html.indexOf('Our cakes')).toBeLessThan(html.indexOf('Delivery &amp; pickup'));}
 const html=renderToStaticMarkup(<WebsiteTemplate brief={publicBrief({...brief,sections:[...brief.sections].reverse()})}/>);expect(html.indexOf('Delivery &amp; pickup')).toBeLessThan(html.indexOf('Our cakes'));
});
test('category suggestions always resolve to a real template',()=>{expect(resolveStyle('auto','Health & wellness')).toBe('clinic');expect(resolveStyle('auto','Retail & local shop')).toBe('bold');expect(resolveStyle('auto','Food & café')).toBe('cafe');expect(resolveStyle('auto','Creative & portfolio')).toBe('studio');expect(resolveStyle('bold','Food & café')).toBe('bold');});
test('customer copy publishes without external credentials, and edits retain the original trial',async()=>{
 const {db,sqlite}=database();try{
 const token='d'.repeat(64),env={DB:db,ADMIN_EMAIL:'admin@example.test'};sqlite.prepare('INSERT INTO site_users(id,email,name,created_at) VALUES (?,?,?,?)').run('owner',base.email,'Owner','2030-01-01');sqlite.prepare('INSERT INTO site_sessions VALUES (?,?,?)').run(await digest(token),'owner','2040-01-01');
 const owner=new SiteService(env,new Request('https://sites.example.test',{headers:{cookie:'__Host-fs_sites_session='+token}})),admin=new SiteService(env,new Request('https://sites.example.test',{headers:{'oai-authenticated-user-email':env.ADMIN_EMAIL,'oai-authenticated-user-id':'admin'}}));
 const request=await owner.submit(base);let detail=await admin.detail(request.id);detail=await admin.update(request.id,{action:'publish',version:detail.version});expect(detail.access).toBe('preview');expect((await owner.mine()).requests[0].id).toBe(request.id);
 const updated=await owner.customerUpdate(request.id,{version:detail.version,brief:{...base,description:'We make custom cakes for birthdays and celebrations in Patna.'}});expect(updated.trialEndsAt).toBe(detail.trialEndsAt);expect((await owner.publicSite(base.slug))!.brief.description).toBe(updated.brief.description);
 }finally{sqlite.close();}
});
