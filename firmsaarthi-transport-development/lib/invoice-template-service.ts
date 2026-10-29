import {AppError,type TransportService} from './service';
import {defaultInvoiceTemplate,validateInvoiceTemplate} from './invoice-template';
export class InvoiceTemplateService{
  constructor(private s:TransportService){}
  async state(){const m=await this.s.owner(),row=await this.s.first('SELECT * FROM invoice_templates WHERE org_id=?',m.org_id);return {config:row&&JSON.parse(row.config)!==null?validateInvoiceTemplate(JSON.parse(row.config)):defaultInvoiceTemplate(),custom:!!row&&JSON.parse(row.config)!==null,version:row?.version||0,updatedAt:row?.updated_at||null};}
  async save(value:unknown,version:unknown,reset=false){const m=await this.s.owner(),config=reset?null:validateInvoiceTemplate(value),expected=Number(version);if(!Number.isSafeInteger(expected)||expected<0)throw new AppError('Reload the invoice template before saving.',409);
    const at=new Date().toISOString(),id=crypto.randomUUID(),writes=expected===0?[this.s.statement('INSERT INTO invoice_templates(org_id,config,version,updated_at,updated_by) SELECT ?,?,1,?,? WHERE NOT EXISTS(SELECT 1 FROM invoice_templates WHERE org_id=?) RETURNING org_id',m.org_id,JSON.stringify(config),at,this.s.user.userId,m.org_id)]:[this.s.statement('UPDATE invoice_templates SET config=?,version=version+1,updated_at=?,updated_by=? WHERE org_id=? AND version=? RETURNING org_id',JSON.stringify(config),at,this.s.user.userId,m.org_id,expected)];
    const result=await this.s.db.batch([...writes,this.s.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',id,m.org_id,this.s.user.userId,reset?'invoice.template.reset':'invoice.template.save',JSON.stringify({version:expected+1}),at)]);if(!result[0].results?.length)throw new AppError('This template changed. Reload before saving.',409);return this.state();
  }
}
