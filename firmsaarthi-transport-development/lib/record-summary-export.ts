import type {Row} from './domain';
import {summaryTables} from './record-summary';
import {csv} from './export-files';
export async function recordSummaryFile(report:Row,format:string){
 const table=summaryTables(report),title=(report.kind==='consignments'?'Consignment summary':'Invoice summary')+' '+report.year;
 const filters=Object.entries(report.filters).filter(([,v])=>v).map(([k,v])=>`${k}: ${v}`).join(' | ')||'All records in selected financial year';
 const note=report.kind==='consignments'?'Freight balance is freight less consignment advance, not invoice receivables. Customer payment status comes from its complete invoice.':'Complete invoices are counted once. Operational filters match linked consignments; amounts are not prorated. Excess receipts do not offset other invoices.';
 if(format==='csv')return {type:'text/csv;charset=utf-8',bytes:csv([title],[['Filters',filters],['Generated',report.generatedAt],['Note',note],[],table.groupHeaders,...table.groupRows,[],table.headers,...table.rows])};
 if(format==='pdf'){
  const {summaryPdf}=await import('./summary-pdf');return {type:'application/pdf',bytes:await summaryPdf(title,filters,note,table)};
 }
 if(format!=='xlsx')throw Error('Choose CSV, Excel or PDF.');
 const ExcelJS=(await import('exceljs')).default,book=new ExcelJS.Workbook();book.creator='FirmSaarthi';
 for(const [name,headers,rows]of [['Company summary',table.groupHeaders,table.groupRows],['Records',table.headers,table.rows]] as [string,string[],unknown[][]][]){const s=book.addWorksheet(name);s.addRow([title]);s.addRow(['Filters',filters]);s.addRow(['Note',note]);s.addRow(headers);for(const row of rows)s.addRow(row);s.getRow(4).font={bold:true};s.views=[{state:'frozen',ySplit:4}];s.autoFilter={from:{row:4,column:1},to:{row:4,column:headers.length}};s.columns.forEach((c,i)=>{c.width=headers[i]==='Company'?32:22;if(headers[i].endsWith(' INR'))c.numFmt='#,##0.00';});}return {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',bytes:new Uint8Array(await book.xlsx.writeBuffer())};
}
