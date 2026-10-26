import { money, invoiceTotals, checkYear, rateParts, type Row } from './domain';
export function legacyDate(v:unknown):string {
  if(v===''||v==null)return '';
  if(typeof v==='number')return new Date(Date.UTC(1899,11,30)+Math.floor(v)*86400000).toISOString().slice(0,10);
  const s=String(v).trim();if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);
  const parsed=Date.parse(s);if(!Number.isFinite(parsed))throw new Error(`Invalid legacy date: ${s}`);return new Date(parsed).toISOString().slice(0,10);
}
const string=(v:unknown)=>String(v??'').trim();
const yes=(v:unknown)=>['yes','true','1'].includes(string(v).toLowerCase());
const rowObject=(headers:unknown[],row:unknown[]):Row=>Object.fromEntries(headers.map((k,i)=>[String(k),row[i]??'']));
const rows=(grid:any[][]):Row[]=>grid.slice(1).map((r,i):Row=>({...rowObject(grid[0],r),_row:i+2})).filter(r=>Object.entries(r).some(([k,v])=>k!=='_row'&&v!==''));
export function prepareLegacyImport(source:Row,orgId:string,ownerId:string,files:Row[],timestamp=new Date().toISOString()) {
  const sourceId=string(source.tenant);if(!sourceId)throw new Error('Missing legacy account ID.');
  const profileRow=rowObject(source.profile[0],source.profile[1]);
  const profile:Row={};for(const [old,key]of Object.entries({'Transport Name':'transportName','Address':'address','Contact Number':'contactNumber','Gst':'gst','A/C Name':'acName','A/C Number':'acNumber','Ifsc Code':'ifscCode','Swift Code':'swiftCode','Bank Name':'bankName'}))profile[key]=string(profileRow[old]);
  profile.logo=profileRow['Logo File ID']?`legacy-file-${profileRow['Logo File ID']}`:'';profile.qr=profileRow['QR Code File ID']?`legacy-file-${profileRow['QR Code File ID']}`:'';
  const companies:Row[]=rows(source.companies).map(r=>({id:`legacy-company-${sourceId}-${r._row}`,org_id:orgId,name:string(r['Company Name']),address:string(r.Address),gst:string(r['Company GST Number']),legacy_key:`${sourceId}:companies:${r._row}`}));
  if(companies.some(r=>!r.name))throw new Error('A company row has no name.');
  const consignments:Row[]=[],invoices:Row[]=[],items:Row[]=[],sequences:Row[]=[],warnings:Row[]=[];
  for(const y of source.years){
    const year=checkYear(y.year);const cs=rows(y.consignments),ins=rows(y.invoices);const invoiceMap=new Map(ins.map(r=>[string(r['Invoice Number']),r]));
    const normalized=cs.map(r=>{
      const cn=string(r['Consignment Number']);if(!cn)throw new Error(`Missing consignment number at row ${r._row}.`);
      const record:Row={id:`legacy-cn-${sourceId}-${year}-${r._row}`,org_id:orgId,year,cn,date:legacyDate(r.Date),company:string(r.Company),truck:string(r['Truck Number']),origin:string(r.From),destination:string(r.To),...rateParts(r.Rate),weight:string(r.Weight)||'0',freight:money(r.Freight),advance:money(r.Advance),method:string(r['Payment Method'])||'Billed',provider:string(r['Truck Provider']),truck_freight:money(r['Truck Freight']),other_charges:money(r['Other Charges']),advance_paid:money(r['Advance Paid']),balance_paid:money(r['Balance Paid']),advance_date:legacyDate(r['Advance Payment Date']),balance_date:legacyDate(r['Balance Payment Date']),payment_done:yes(r['Payment Done'])?1:0,created_at:timestamp,updated_at:timestamp,legacy_key:`${sourceId}:${year}:${r._row}`};
      if(!record.date)throw new Error('Missing consignment date.');
      if(record.date<`${year.slice(0,4)}-04-01`||record.date>`${year.slice(5)}-03-31`)warnings.push({kind:'dateOutsideYear',row:r._row,year});
      if(r['Invoice Number']&&!invoiceMap.has(string(r['Invoice Number'])))throw new Error(`Consignment row ${r._row} references missing invoice ${r['Invoice Number']}.`);
      return {record,invoiceNumber:string(r['Invoice Number']),source:r};
    });
    const cnCounts=new Map<string,number>();for(const {record}of normalized)cnCounts.set(record.cn,(cnCounts.get(record.cn)||0)+1);
    for(const [cn,count]of cnCounts)if(count>1)warnings.push({kind:'duplicateConsignmentNumber',year,cn,count});
    consignments.push(...normalized.map(r=>r.record));
    const seenNumbers=new Set<number>();
    for(const r of ins){
      const number=Number(r['Invoice Number']);if(!Number.isSafeInteger(number)||number<1||seenNumbers.has(number))throw new Error('Invoice numbers must be unique positive integers within a year.');seenNumbers.add(number);
      const linked=normalized.filter(x=>x.invoiceNumber===String(number));if(!linked.length)throw new Error(`Invoice ${number} has no linked source consignments.`);
      if(linked.some(x=>x.record.company!==string(r.Company)))throw new Error(`Company mismatch in invoice ${number}.`);
      let details:Row={};try{details=r['Other Details']?JSON.parse(r['Other Details']):{};}catch{throw new Error(`Invalid invoice details JSON for invoice ${number}.`);}
      const totalsSource=details.invoiceTotals||{},tax=details.taxConfig||{};
      const taxMode=(tax.taxMode||totalsSource.taxMode||'none').replace('_','-');const paidBy=tax.paidByConsignor?'consignor':tax.paidByConsignee?'consignee':'';
      const charges=(details.otherCharges||[]).map((c:Row)=>({description:string(c.description),cn:string(c.cn),date:legacyDate(c.date),amount:money(c.amount)}));
      const computed=invoiceTotals(linked.map(x=>x.record),charges,taxMode,paidBy);const totals={...computed,total:money(r['Total Amount'])};
      for(const [old,key]of Object.entries({totalFreight:'freight',totalAdvance:'advance',totalOtherCharges:'other',subTotal:'subtotal',balanceBeforeTax:'balance',igstAmount:'igst',cgstAmount:'cgst',sgstAmount:'sgst'}))if(totalsSource[old]!==undefined)(totals as Row)[key]=money(totalsSource[old]);
      if(computed.total!==totals.total)warnings.push({kind:'sourceInvoiceTotalPreserved',year,number,source:totals.total,recomputed:computed.total});
      const refs=string(r['Consignment Numbers']).split(',').map(string).sort(),actual=linked.map(x=>x.record.cn).sort();
      if(JSON.stringify(refs)!==JSON.stringify(actual))warnings.push({kind:'sourceInvoiceReferenceMismatch',year,number,source:refs,resolvedFromConsignmentInvoiceColumn:actual});
      const party=companies.find(c=>c.name===string(r.Company))||{name:string(r.Company),address:'',gst:''};const invoiceId=`legacy-invoice-${sourceId}-${year}-${number}`;
      const pdfId=string(r['File ID']);if(pdfId&&!files.some(f=>f.id===pdfId))throw new Error(`Original PDF for invoice ${number} has not been staged.`);
      const snapshot={profile,party:{name:party.name,address:party.address,gst:party.gst},items:linked.map(x=>x.record),charges,totals,taxMode,paidBy,references:details.invoiceReferences||{},legacyPdfAsset:pdfId?`legacy-file-${pdfId}`:null,legacy:{source:sourceId,spreadsheet:y.spreadsheetId,row:r._row,originalDetails:details,originalConsignmentReferences:r['Consignment Numbers']}};
      invoices.push({id:invoiceId,org_id:orgId,year,number,date:legacyDate(r['Invoice Date']),company:string(r.Company),total:totals.total,paid:yes(r.Paid)?1:0,snapshot:JSON.stringify(snapshot),revision:1,created_at:timestamp});
      items.push(...linked.map(x=>({invoice_id:invoiceId,consignment_id:x.record.id})));
    }
    if(ins.length)sequences.push({org_id:orgId,year,next:Math.max(...seenNumbers)});
  }
  const assets=files.map(f=>({id:`legacy-file-${f.id}`,org_id:orgId,name:f.name,mime:f.mime,created_at:timestamp}));
  assets.push({id:`legacy-source-${sourceId}`,org_id:orgId,name:'Legacy source snapshot.json',mime:'application/json',created_at:timestamp});
  for(const key of ['logo','qr'])if(profile[key]&&!assets.some(a=>a.id===profile[key]))throw new Error(`Profile ${key} file is missing.`);
  const summary={consignments:consignments.length,invoices:invoices.length,companies:companies.length,invoiceLinks:items.length,originalPdfs:files.filter(f=>f.mime==='application/pdf').length,images:files.filter(f=>f.mime.startsWith('image/')).length,freight:consignments.reduce((s,r)=>s+r.freight,0),customerAdvance:consignments.reduce((s,r)=>s+r.advance,0),invoiceTotal:invoices.reduce((s,r)=>s+r.total,0),paidInvoiceTotal:invoices.filter(r=>r.paid).reduce((s,r)=>s+r.total,0),truckFreight:consignments.reduce((s,r)=>s+r.truck_freight,0),truckOtherCharges:consignments.reduce((s,r)=>s+r.other_charges,0),advancePaid:consignments.reduce((s,r)=>s+r.advance_paid,0),balancePaid:consignments.reduce((s,r)=>s+r.balance_paid,0),maxInvoice:Math.max(0,...invoices.map(r=>r.number))};
  return {format:'tms-legacy-import-v1',source:sourceId,orgId,ownerId,timestamp,profile,records:{companies,consignments,invoices,invoice_items:items,invoice_sequences:sequences,assets},files,summary,warnings,sourceArchive:source};
}
