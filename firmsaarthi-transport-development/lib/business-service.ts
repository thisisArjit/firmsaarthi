import { AppError, type TransportService } from './service';
import { required, type Row } from './domain';
export class BusinessService {
  constructor(private s:TransportService){}
  async state(){const m=await this.s.commercial();return {leads:await this.s.rows('SELECT * FROM business_leads WHERE org_id=? ORDER BY updated_at DESC,name',m.org_id)};}
  async command(action:string,d:Row):Promise<Row>{
    const s=this.s,m=await s.commercial(),org=m.org_id,t=new Date().toISOString();
    if(action==='business.lead.save'){
      const name=required(d.name,'Company name',200),city=required(d.city,'City',100),area=String(d.area||'').trim(),industry=String(d.industry||'').trim(),notes=String(d.notes||'').trim(),source=String(d.sourceUrl||'').trim(),status=String(d.status||'research');
      if(area.length>300||industry.length>120||notes.length>2000||source.length>1000)throw new AppError('Prospect details are too long.');
      if(!['research','contacted','qualified','not_suitable'].includes(status))throw new AppError('Choose a supported prospect status.');
      if(source){try{const url=new URL(source);if(url.protocol!=='https:'||url.username||url.password)throw new Error();}catch{throw new AppError('Use an HTTPS source or company website.');}}
      const previous=d.id?await s.owned('business_leads',String(d.id),org):null;
      const phone=String(d.phone===undefined?previous?.phone||'':d.phone).trim(),email=String(d.email===undefined?previous?.email||'':d.email).trim(),contactSource=String(d.contactSourceUrl===undefined?previous?.contact_source_url||'':d.contactSourceUrl).trim(),checkedOn=String(d.contactCheckedOn===undefined?previous?.contact_checked_on||'':d.contactCheckedOn).trim();
      if(phone&&(!/^[+0-9 ()-]{5,40}$/.test(phone)||phone.replace(/\D/g,'').length<5)||email&&(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)||email.length>254))throw new AppError('Enter a valid business phone and email.');
      if(contactSource){try{const url=new URL(contactSource);if(contactSource.length>1000||url.protocol!=='https:'||url.username||url.password)throw new Error();}catch{throw new AppError('Use an HTTPS contact source.');}}
      if(checkedOn&&(!/^\d{4}-\d{2}-\d{2}$/.test(checkedOn)||!Number.isFinite(Date.parse(checkedOn))||new Date(checkedOn).toISOString().slice(0,10)!==checkedOn||checkedOn>new Date().toISOString().slice(0,10)))throw new AppError('Use a valid past or current contact research date.');
      const existing=d.id?previous:await s.first('SELECT * FROM business_leads WHERE org_id=? AND name=? AND city=?',org,name,city);
      if(existing&&!d.id)return {success:true,id:existing.id,alreadySaved:true};
      const leadId=existing?.id||crypto.randomUUID();
      if(existing){const result=await s.db.batch([s.statement('UPDATE business_leads SET name=?,city=?,area=?,industry=?,source_url=?,notes=?,status=?,phone=?,email=?,contact_source_url=?,contact_checked_on=?,version=version+1,updated_at=? WHERE id=? AND org_id=? AND version=? RETURNING id',name,city,area,industry,source,notes,status,phone,email,contactSource,checkedOn,t,leadId,org,Number(d.version)),s.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',crypto.randomUUID(),org,s.user.userId,action,leadId,t)]);if(!result[0].results?.length)throw new AppError('This prospect changed. Refresh before saving.',409);}
      else await s.db.batch([s.insert('business_leads',{id:leadId,org_id:org,name,city,area,industry,source_url:source,notes,status,phone,email,contact_source_url:contactSource,contact_checked_on:checkedOn,company_id:null,version:1,created_at:t,updated_at:t}),s.audit(org,action,leadId)]);
      return {success:true,id:leadId};
    }
    if(action==='business.lead.customer'){
      const lead=await s.owned('business_leads',String(d.id),org);if(lead.company_id)return {success:true,id:lead.company_id,alreadyAdded:true};
      if(lead.version!==Number(d.version))throw new AppError('This prospect changed. Refresh before adding it.',409);
      const companyId=crypto.randomUUID();
      const result=await s.db.batch([
        s.statement('INSERT INTO companies (id,org_id,name,address,gst) SELECT ?,org_id,name,?,? FROM business_leads WHERE id=? AND org_id=? AND version=? AND company_id IS NULL AND NOT EXISTS(SELECT 1 FROM companies WHERE org_id=? AND name=?)',companyId,[lead.area,lead.city].filter(Boolean).join(', '),'',lead.id,org,lead.version,org,lead.name),
        s.statement('UPDATE business_leads SET company_id=(SELECT id FROM companies WHERE org_id=? AND name=? ORDER BY rowid LIMIT 1),version=version+1,updated_at=? WHERE id=? AND org_id=? AND version=? AND company_id IS NULL RETURNING company_id',org,lead.name,t,lead.id,org,lead.version),
        s.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',crypto.randomUUID(),org,s.user.userId,action,lead.id,t),
      ]);if(!result[1].results?.length)throw new AppError('This prospect changed. Refresh before adding it.',409);return {success:true,id:(await s.owned('business_leads',lead.id,org)).company_id};
    }
    throw new AppError('Unknown business action.',404);
  }
}
