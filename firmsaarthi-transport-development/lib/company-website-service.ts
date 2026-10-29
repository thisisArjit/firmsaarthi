import {AppError,type TransportService} from './service';
import {validateWebsite,websiteSlug,websiteBasics} from './company-website';
export class CompanyWebsiteService{
  constructor(private s:TransportService){}
  async state(){const m=await this.s.owner(),row=await this.s.first('SELECT * FROM company_websites WHERE org_id=?',m.org_id),org=(await this.s.first('SELECT name,profile FROM organizations WHERE id=?',m.org_id))!,profile=JSON.parse(org.profile);
    const routes=await this.s.rows("SELECT origin,destination,COUNT(*) n FROM consignments WHERE org_id=? AND origin<>'' AND destination<>'' GROUP BY origin,destination ORDER BY n DESC LIMIT 30",m.org_id);
    return {slug:row?.slug||'',version:row?.version||0,draft:row?JSON.parse(row.draft):websiteBasics(org.name,profile),published:row?.published?JSON.parse(row.published):null,publishedAt:row?.published_at||null,suggestions:routes.map(r=>String(r.origin)+' → '+String(r.destination))};
  }
  async command(action:string,data:Record<string,unknown>){const m=await this.s.owner(),version=Number(data.version);if(!Number.isSafeInteger(version)||version<0)throw new AppError('Reload the website before saving.',409);const at=new Date().toISOString();let write:D1PreparedStatement;
    if(action==='save'){let slug:string,config;try{slug=websiteSlug(data.slug);config=validateWebsite(data.draft);}catch(e){throw new AppError((e as Error).message);}
      // A published address remains reserved, including while temporarily unpublished.
      const existing=await this.s.first('SELECT slug,published_at FROM company_websites WHERE org_id=?',m.org_id);if(existing?.published_at&&slug!==existing.slug)throw new AppError('Your published address is permanent. Keep the existing address to preserve shared links.',409);
      write=version===0?this.s.statement('INSERT INTO company_websites(org_id,slug,draft,version,updated_at) SELECT ?,?,?,1,? WHERE NOT EXISTS(SELECT 1 FROM company_websites WHERE org_id=?) RETURNING org_id',m.org_id,slug,JSON.stringify(config),at,m.org_id):this.s.statement('UPDATE company_websites SET slug=?,draft=?,version=version+1,updated_at=? WHERE org_id=? AND version=? RETURNING org_id',slug,JSON.stringify(config),at,m.org_id,version);
    }else if(action==='publish'){if(data.confirm!==true)throw new AppError('Confirm that the preview contains only information you want to make public.');const row=await this.s.first('SELECT draft FROM company_websites WHERE org_id=?',m.org_id);if(!row)throw new AppError('Save and preview your website first.');try{const config=validateWebsite(JSON.parse(row.draft));if(!config.phone&&!config.email&&!config.whatsapp)throw new Error('Add at least one public contact method before publishing.');}catch(e){throw new AppError((e as Error).message);}
      write=this.s.statement('UPDATE company_websites SET published=draft,published_at=?,version=version+1,updated_at=? WHERE org_id=? AND version=? RETURNING org_id',at,at,m.org_id,version);
    }else if(action==='unpublish'){write=this.s.statement('UPDATE company_websites SET published=NULL,version=version+1,updated_at=? WHERE org_id=? AND version=? RETURNING org_id',at,m.org_id,version);}else throw new AppError('Unknown website action.');
    let result;try{result=await this.s.db.batch([write,this.s.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',crypto.randomUUID(),m.org_id,this.s.user.userId,'website.'+action,JSON.stringify({version:version+1}),at)]);}catch(e){if(/unique|constraint/i.test((e as Error).message))throw new AppError('That website address is already taken. Choose another.',409);throw e;}
    if(!result[0].results?.length)throw new AppError('This website changed. Reload before saving or publishing.',409);return this.state();
  }
}
export async function publishedWebsite(db:D1Database,value:string){let slug:string;try{slug=websiteSlug(value);}catch{return null;}const row=await db.prepare('SELECT published FROM company_websites WHERE slug=? AND published IS NOT NULL').bind(slug).first<{published:string}>();return row?validateWebsite(JSON.parse(row.published)):null;}
