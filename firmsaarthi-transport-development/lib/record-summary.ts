import {checkYear,dateValue,type Row} from './domain';
import {AppError,TransportService} from './service';
import {consignmentStatusSql} from './consignment-status';
export type SummaryKind='consignments'|'invoices';
import {summaryPaymentLabels as paymentLabels} from './record-summary-labels';
const stageLabels:Record<string,string>={initiated:'Initiated',in_progress:'In progress',complete:'Complete'};
const amount=(v:unknown)=>Number(v||0);
export async function loadRecordSummary(svc:TransportService,input:ReturnType<typeof summaryFilters>){
 const m=await svc.owner(),org=m.org_id;
 const records=await svc.db.batch([
  svc.statement(`SELECT c.*,${consignmentStatusSql} AS display_stage_status,i.id AS invoice_id,i.number AS invoice_number,i.paid AS invoice_paid FROM consignments c LEFT JOIN invoice_items x ON x.consignment_id=c.id LEFT JOIN invoices i ON i.id=x.invoice_id AND i.org_id=c.org_id WHERE c.org_id=? AND c.year=? ORDER BY c.date DESC,c.cn`,org,input.year),
  svc.statement("SELECT i.id,i.number,i.date,i.company,i.total,i.paid,CASE WHEN i.paid=1 AND NOT EXISTS(SELECT 1 FROM invoice_receipts r WHERE r.invoice_id=i.id AND r.org_id=i.org_id) THEN i.total ELSE COALESCE((SELECT SUM(r.amount) FROM invoice_receipts r WHERE r.invoice_id=i.id AND r.org_id=i.org_id AND r.status='posted'),0) END AS received_amount FROM invoices i WHERE i.org_id=? AND i.year=? ORDER BY i.date DESC,i.number DESC",org,input.year),
  svc.statement('SELECT name FROM companies WHERE org_id=? ORDER BY name',org),
 ]);
 return buildRecordSummary({consignments:(records[0].results as Row[]).map((c:Row)=>({...c,stage_status:c.display_stage_status})),invoices:records[1].results,companies:records[2].results},input);
}
export function summaryFilters(params:URLSearchParams){
 const year=checkYear(params.get('year')),kind=params.get('kind')||'consignments';if(!['consignments','invoices'].includes(kind))throw new AppError('Choose a supported summary.');
 const f:Row={};for(const key of ['company','from','to','method','invoicing','payment','stage','truck','origin','destination','provider','number']){const v=params.get(key)||'';if(v.length>200)throw new AppError('Filter is too long.');f[key]=v;}
 if(f.from)dateValue(f.from,year);if(f.to)dateValue(f.to,year);if(f.from&&f.to&&f.from>f.to)throw new AppError('From date must be on or before To date.');
 if(f.invoicing&&!['invoiced','not-invoiced'].includes(f.invoicing)||f.payment&&!['paid','part-paid','unpaid','pending','not-invoiced'].includes(f.payment)||f.stage&&!['initiated','in_progress','complete'].includes(f.stage))throw new AppError('Choose a valid status filter.');
 if(kind==='invoices'&&(f.invoicing==='not-invoiced'||f.payment==='not-invoiced'))throw new AppError('Not invoiced applies to the consignment summary.');
 return {year,kind:kind as SummaryKind,filters:f};
}
export function invoicePayment(row:Row){const received=amount(row.received_amount),total=amount(row.total);return row.paid||received>=total?'paid':received>0?'part-paid':'unpaid';}
export function buildRecordSummary(state:Row,input:ReturnType<typeof summaryFilters>){
 const {kind,year,filters:f}=input,cn:Row[]=state.consignments||[],invoices:Row[]=state.invoices||[],byInvoice=new Map(invoices.map(i=>[i.id,i]));
 const contains=(value:unknown,filter:unknown)=>!filter||String(value||'').toLowerCase().includes(String(filter).toLowerCase());
 const matchesConsignment=(r:Row)=>['truck','origin','destination','provider'].every(k=>contains(r[k],f[k]))&&(!f.method||r.method===f.method)&&(!f.stage||r.stage_status===f.stage);
 const dateMatches=(date:string)=>(!f.from||date>=f.from)&&(!f.to||date<=f.to);
 const paymentMatches=(status:string)=>!f.payment||(f.payment==='pending'?['unpaid','part-paid'].includes(status):f.payment===status);
 const rows:Row[]=kind==='consignments'?cn.filter(r=>(!f.company||r.company===f.company)&&contains(r.cn,f.number)&&dateMatches(r.date)&&matchesConsignment(r)&&(!f.invoicing||(f.invoicing==='invoiced'?!!r.invoice_id:!r.invoice_id))&&paymentMatches(r.invoice_id?invoicePayment(byInvoice.get(r.invoice_id)||{paid:r.invoice_paid,total:1}):'not-invoiced')).map(r=>({id:r.id,number:r.cn,date:r.date,company:r.company,truck:r.truck,origin:r.origin,destination:r.destination,provider:r.provider,method:r.method,freight:amount(r.freight),advance:amount(r.advance),balance:amount(r.freight)-amount(r.advance),invoiced:!!r.invoice_id,invoice:r.invoice_number||'',payment:r.invoice_id?invoicePayment(byInvoice.get(r.invoice_id)||{paid:r.invoice_paid,total:1}):'not-invoiced',stage:r.stage_status||''})):invoices.filter(r=>{
  if((f.company&&r.company!==f.company)||!contains(r.number,f.number)||!dateMatches(r.date)||!paymentMatches(invoicePayment(r)))return false;
  const hasConsignmentFilter=['method','stage','truck','origin','destination','provider'].some(k=>f[k]);
  // One complete invoice, counted once. A single linked consignment must match all operational filters.
  return !hasConsignmentFilter||cn.some(c=>c.invoice_id===r.id&&matchesConsignment(c));
 }).map(r=>({id:r.id,number:r.number,date:r.date,company:r.company,total:amount(r.total),received:amount(r.received_amount),remaining:Math.max(0,amount(r.total)-amount(r.received_amount)),excess:Math.max(0,amount(r.received_amount)-amount(r.total)),payment:invoicePayment(r),consignments:cn.filter(c=>c.invoice_id===r.id).map(c=>c.cn).join(', ')}));
 const keys=kind==='consignments'?['freight','advance','balance']:['total','received','remaining','excess'];
 const totals:Row={count:rows.length,...(kind==='consignments'?{invoiced:rows.filter(r=>r.invoiced).length,notInvoiced:rows.filter(r=>!r.invoiced).length}:{})};for(const k of keys)totals[k]=rows.reduce((n,r)=>n+r[k],0);
 const groups=new Map<string,Row>();for(const r of rows){let g=groups.get(r.company);if(!g){g={company:r.company,count:0,...Object.fromEntries(keys.map(k=>[k,0]))};groups.set(r.company,g);}g.count++;for(const k of keys)g[k]+=r[k];}
 const options:Row={companies:[...new Set([...cn,...invoices].map(r=>String(r.company)).concat((state.companies||[]).map((c:Row)=>String(c.name))))].sort(),methods:[...new Set(['Billed','To Pay',...cn.map(r=>String(r.method||'')).filter(Boolean)])].sort()};
 return {kind,year,filters:f,rows,totals,groups:[...groups.values()].sort((a,b)=>a.company.localeCompare(b.company)),options,generatedAt:new Date().toISOString()};
}
export function summaryTables(report:Row){
 const cn=report.kind==='consignments',headers=cn?['Consignment','Date','Company','Truck','From','To','Supplier','Payment terms','Freight INR','Advance INR','Freight balance INR','Invoice','Customer payment','Consignment status']:['Invoice','Date','Company','Invoice amount INR','Received INR','Remaining INR','Excess INR','Payment status','Consignments'];
 const money=(n:number)=>n/100;
 const rows=report.rows.map((r:Row)=>cn?[String(r.number),r.date,r.company,r.truck,r.origin,r.destination,r.provider,r.method,money(r.freight),money(r.advance),money(r.balance),r.invoiced?String(r.invoice):'Not invoiced',paymentLabels[r.payment],stageLabels[r.stage]||'Not recorded']:[String(r.number),r.date,r.company,money(r.total),money(r.received),money(r.remaining),money(r.excess),paymentLabels[r.payment],r.consignments]);
 const groupHeaders=cn?['Company','Consignments','Freight INR','Advance INR','Freight balance INR']:['Company','Invoices','Invoice amount INR','Received INR','Remaining INR','Excess INR'];
 const groupRows=report.groups.map((g:Row)=>cn?[g.company,g.count,money(g.freight),money(g.advance),money(g.balance)]:[g.company,g.count,money(g.total),money(g.received),money(g.remaining),money(g.excess)]);
 const t=report.totals;groupRows.push(cn?['TOTAL',t.count,money(t.freight),money(t.advance),money(t.balance)]:['TOTAL',t.count,money(t.total),money(t.received),money(t.remaining),money(t.excess)]);
 return {headers,rows,groupHeaders,groupRows};
}
