import { AppError, type TransportService } from './service';
import { dateValue, required, type Row } from './domain';
import { balanceReport } from './account-balances';
const now=()=>new Date().toISOString(),id=()=>crypto.randomUUID(),today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function accountKind(value:unknown){const kind=String(value);if(!['customer','supplier'].includes(kind))throw new AppError('Choose customer or supplier accounts.');return kind;}
export class AccountsService{
  constructor(private s:TransportService){}
  async command(action:string,d:Row):Promise<Row>{
    const s=this.s,m=await s.owner(),org=m.org_id;
    if(action==='account.save'){
      const kind=accountKind(d.kind),code=required(d.code,'Account code',40).toUpperCase(),name=required(d.name,'Account name',200),t=now();if(!/^[A-Z0-9-]+$/.test(code))throw new AppError('Account code must use letters, digits or hyphens.');
      if(d.id){const party=await s.owned('parties',String(d.id),org);if(party.kind!==kind)throw new AppError('An account must keep its original customer/supplier type.');const result=await s.db.batch([s.statement('UPDATE parties SET code=?,name=?,version=version+1,updated_at=? WHERE id=? AND org_id=? AND version=? RETURNING id',code,name,t,party.id,org,Number(d.version)),s.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',id(),org,s.user.userId,action,party.id,t)]);if(!result[0].results?.length)throw new AppError('This account changed. Refresh before editing.',409);return {success:true,id:party.id};}
      const partyId=id();await s.db.batch([s.insert('parties',{id:partyId,org_id:org,kind,code,name,version:1,created_at:t,updated_at:t}),s.audit(org,action,partyId)]);return {success:true,id:partyId};
    }
    if(action==='account.alias.link'){
      const party=await s.owned('parties',String(d.partyId),org),alias=String(d.alias??''),kind=party.kind,table=kind==='customer'?'invoices':'consignments',nameField=kind==='customer'?'company':'provider',partyField=kind==='customer'?'customer_party_id':'supplier_party_id';if(!alias.trim()||alias.length>200)throw new AppError('An exact source name of up to 200 characters is required.');
      if(await s.first(`SELECT id FROM ${table} WHERE org_id=? AND ${nameField}=? AND ${partyField} IS NOT NULL AND ${partyField}<>? LIMIT 1`,org,alias,party.id))throw new AppError('Some records with this source name are linked to another account. Reconcile that mapping first.');
      const auditId=id(),t=now();await s.db.batch([
        s.statement('INSERT INTO party_aliases (id,org_id,party_id,kind,alias,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(org_id,kind,alias) DO NOTHING',id(),org,party.id,kind,alias,t),
        s.statement(`UPDATE ${table} SET ${partyField}=? WHERE org_id=? AND ${nameField}=? AND ${partyField} IS NULL AND EXISTS(SELECT 1 FROM party_aliases WHERE org_id=? AND kind=? AND alias=? AND party_id=?)`,party.id,org,alias,org,kind,alias,party.id),
        s.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM party_aliases WHERE org_id=? AND kind=? AND alias=? AND party_id=?)',auditId,org,s.user.userId,action,`${party.id}: ${alias}`,t,org,kind,alias,party.id),
      ]);if(!await s.first('SELECT id FROM audit WHERE id=? AND org_id=?',auditId,org))throw new AppError('This exact name is already linked to a different account.',409);return {success:true};
    }
    if(action==='account.terms.save'){
      const invoice=await s.owned('invoices',String(d.invoiceId),org),due=d.dueDate?dateValue(d.dueDate):null,note=required(d.note,'Agreement / correction reference',500),t=now(),auditId=id(),version=Number(d.version);
      if(due&&due<invoice.date)throw new AppError('Customer due date cannot be before the invoice date.');
      const result=await s.db.batch([s.statement('UPDATE invoices SET due_date=?,terms_version=terms_version+1 WHERE id=? AND org_id=? AND terms_version=? RETURNING id',due,invoice.id,org,version),s.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',auditId,org,s.user.userId,action,invoice.id,t),s.statement('INSERT INTO invoice_terms_history (id,org_id,invoice_id,due_date,note,version,actor,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM audit WHERE id=? AND org_id=?)',id(),org,invoice.id,due,note,version+1,s.user.userId,t,auditId,org)]);if(!result[0].results?.length)throw new AppError('Invoice terms changed. Refresh before saving.',409);return {success:true};
    }
    throw new AppError('Unknown account action.',404);
  }
  async state(kindValue:unknown):Promise<Row>{
    const s=this.s,m=await s.owner(),org=m.org_id,kind=accountKind(kindValue);if(kind==='customer')await s.initializeLegacyReceipts(org);
    const [parties,aliases,rows]=await Promise.all([
      s.rows('SELECT * FROM parties WHERE org_id=? AND kind=? ORDER BY name,code',org,kind),s.rows('SELECT * FROM party_aliases WHERE org_id=? AND kind=? ORDER BY alias',org,kind),
      kind==='customer'?s.rows("SELECT i.id,i.number,i.year,i.date,i.company AS label,i.total AS cost,i.due_date,i.terms_version,p.id AS party_id,p.name AS party_name,p.code AS party_code,COALESCE((SELECT SUM(amount) FROM invoice_receipts r WHERE r.org_id=i.org_id AND r.invoice_id=i.id AND r.status='posted'),0) AS paid FROM invoices i LEFT JOIN parties p ON p.id=i.customer_party_id AND p.org_id=i.org_id AND p.kind='customer' WHERE i.org_id=? ORDER BY i.date,i.number",org):s.rows("SELECT c.id,c.cn AS number,c.year,c.date,c.provider AS label,c.truck,c.truck_freight+c.other_charges AS cost,c.provider_due_date AS due_date,p.id AS party_id,p.name AS party_name,p.code AS party_code,c.settlement_initialized,c.advance_paid,c.balance_paid,c.advance_date,c.balance_date,CASE WHEN c.settlement_initialized=1 THEN COALESCE((SELECT SUM(amount) FROM supplier_payments x WHERE x.org_id=c.org_id AND x.consignment_id=c.id AND x.status='posted'),0) ELSE c.advance_paid+c.balance_paid END AS paid FROM consignments c LEFT JOIN parties p ON p.id=c.supplier_party_id AND p.org_id=c.org_id AND p.kind='supplier' WHERE c.org_id=? ORDER BY c.date,c.cn",org),
    ]);
    return {kind,parties,aliases,...balanceReport(rows,today())};
  }
  async statement(kindValue:unknown,key:string):Promise<Row>{
    const s=this.s,m=await s.owner(),state=await this.state(kindValue),group=state.groups.find((g:Row)=>g.key===key);if(!group)throw new AppError('Account balance group not found.',404);
    const documents=state.documents.filter((d:Row)=>d.key===key),ids=new Set(documents.map((d:Row)=>d.id));let payments:Row[];
    if(state.kind==='customer')payments=(await s.rows('SELECT r.*,r.invoice_id AS document_id,i.number,i.year FROM invoice_receipts r JOIN invoices i ON i.id=r.invoice_id AND i.org_id=r.org_id WHERE r.org_id=? ORDER BY r.created_at,r.id',m.org_id)).filter(p=>ids.has(p.document_id));
    else{
      payments=(await s.rows('SELECT p.*,p.consignment_id AS document_id,c.cn AS number,c.year FROM supplier_payments p JOIN consignments c ON c.id=p.consignment_id AND c.org_id=p.org_id WHERE p.org_id=? ORDER BY p.created_at,p.id',m.org_id)).filter(p=>ids.has(p.document_id));
      for(const d of documents.filter((r:Row)=>!r.settlement_initialized))for(const [kind,amount,rawDate] of [['advance',d.advance_paid,d.advance_date],['payment',d.balance_paid,d.balance_date]] as [string,number,string][]){if(!amount)continue;let date:string|null=null;try{date=dateValue(rawDate);if(date>today())date=null;}catch{}payments.push({id:`opening-${kind}-${d.id}`,document_id:d.id,number:d.number,year:d.year,date,amount,kind,method:'legacy',source:'legacy_totals',status:'posted',reference:`Opening ${kind}; original date: ${rawDate||'not recorded'}`,void_reason:''});}
    }
    return {kind:state.kind,asOf:state.asOf,group,documents,payments};
  }
}
