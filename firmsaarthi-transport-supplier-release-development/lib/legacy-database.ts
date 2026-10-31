import type { Row } from './domain';
const tableColumns:Record<string,string[]>={
  companies:['id','org_id','name','address','gst','legacy_key'],
  consignments:['id','org_id','year','cn','date','company','truck','origin','destination','rate','rate_label','weight','freight','advance','method','provider','truck_freight','other_charges','advance_paid','balance_paid','advance_date','balance_date','payment_done','created_at','updated_at','legacy_key'],
  invoices:['id','org_id','year','number','date','company','total','paid','snapshot','revision','created_at'],
  invoice_items:['invoice_id','consignment_id'],invoice_sequences:['org_id','year','next'],assets:['id','org_id','name','mime','created_at'],
};
export async function verifyLegacyDatabase(db:D1Database,org:string):Promise<Row>{
  const first=async(sql:string)=>await db.prepare(sql).bind(org).first<Row>();
  const cs=await first('SELECT COUNT(*) consignments,COALESCE(SUM(freight),0) freight,COALESCE(SUM(advance),0) customerAdvance,COALESCE(SUM(truck_freight),0) truckFreight,COALESCE(SUM(other_charges),0) truckOtherCharges,COALESCE(SUM(advance_paid),0) advancePaid,COALESCE(SUM(balance_paid),0) balancePaid FROM consignments WHERE org_id=?');
  const ins=await first('SELECT COUNT(*) invoices,COALESCE(SUM(total),0) invoiceTotal,COALESCE(SUM(CASE WHEN paid=1 THEN total ELSE 0 END),0) paidInvoiceTotal,COALESCE(MAX(number),0) maxInvoice FROM invoices WHERE org_id=?');
  const companies=await first('SELECT COUNT(*) companies FROM companies WHERE org_id=?');
  const links=await first('SELECT COUNT(*) invoiceLinks FROM invoice_items x JOIN invoices i ON i.id=x.invoice_id WHERE i.org_id=?');
  const files=await first("SELECT SUM(CASE WHEN mime='application/pdf' THEN 1 ELSE 0 END) originalPdfs,SUM(CASE WHEN mime LIKE 'image/%' THEN 1 ELSE 0 END) images FROM assets WHERE org_id=?");
  return {...cs,...ins,...companies,...links,...files};
}
export async function applyLegacyDatabase(db:D1Database,data:Row,sha256:string){
  const batchId=`legacy:${data.source}:${data.orgId}`;
  const old=await db.prepare('SELECT * FROM import_batches WHERE id=?').bind(batchId).first<Row>();
  if(old){if(old.sha256!==sha256)throw new Error('This source was already imported with different content.');return {alreadyImported:true,summary:await verifyLegacyDatabase(db,data.orgId)};}
  const member=await db.prepare('SELECT * FROM memberships WHERE user_id=? AND org_id=? AND role=?').bind(data.ownerId,data.orgId,'OWNER').first();
  if(!member)throw new Error('Migration target is not owned by the approved owner.');
  for(const [table,columns]of Object.entries(tableColumns)){
    if(!Array.isArray(data.records[table]))throw new Error(`Missing ${table} records.`);
    for(const row of data.records[table]){if(columns.includes('org_id')&&row.org_id!==data.orgId)throw new Error('Cross-workspace migration is forbidden.');}
  }
  const cnIds=new Set(data.records.consignments.map((r:Row)=>r.id)),invoiceIds=new Set(data.records.invoices.map((r:Row)=>r.id));
  if(data.records.invoice_items.some((r:Row)=>!cnIds.has(r.consignment_id)||!invoiceIds.has(r.invoice_id)))throw new Error('Invoice links leave the approved migration.');
  const queries:D1PreparedStatement[]=[];
  queries.push(db.prepare(`INSERT INTO import_batches (id,org_id,source,sha256,summary,created_at) VALUES (?,?,?,CASE WHEN EXISTS(SELECT 1 FROM consignments WHERE org_id=?) OR EXISTS(SELECT 1 FROM invoices WHERE org_id=?) OR EXISTS(SELECT 1 FROM companies WHERE org_id=?) OR EXISTS(SELECT 1 FROM assets WHERE org_id=?) OR EXISTS(SELECT 1 FROM organizations WHERE id=? AND profile<>'{}') THEN NULL ELSE ? END,?,?)`).bind(batchId,data.orgId,data.source,data.orgId,data.orgId,data.orgId,data.orgId,data.orgId,sha256,JSON.stringify(data.summary),data.timestamp));
  for(const [table,columns]of Object.entries(tableColumns))if(data.records[table].length){
    const expressions=columns.map(k=>`json_extract(value,'$.${k}')`).join(',');
    queries.push(db.prepare(`INSERT INTO ${table} (${columns.join(',')}) SELECT ${expressions} FROM json_each(?)`).bind(JSON.stringify(data.records[table])));
  }
  queries.push(db.prepare('UPDATE organizations SET name=?,profile=? WHERE id=? AND owner_id=?').bind(data.profile.transportName,JSON.stringify(data.profile),data.orgId,data.ownerId));
  queries.push(db.prepare("INSERT INTO invoice_receipts (id,org_id,invoice_id,date,amount,method,reference,status,source,created_at) SELECT 'legacy-paid-' || id,org_id,id,NULL,total,'legacy','Imported paid flag; payment date not recorded','posted','legacy_flag',created_at FROM invoices WHERE org_id=? AND paid=1").bind(data.orgId));
  queries.push(db.prepare('INSERT INTO audit VALUES (?,?,?,?,?,?)').bind(`audit-${batchId}`,data.orgId,data.ownerId,'legacy.import',data.source,data.timestamp));
  await db.batch(queries);
  const actual=await verifyLegacyDatabase(db,data.orgId);
  for(const [key,value]of Object.entries(data.summary))if(actual[key]!==value)throw new Error(`Post-import reconciliation failed for ${key}.`);
  return {alreadyImported:false,summary:actual};
}
