import {test,expect} from 'vitest';
import {database} from './helpers/database';
import {TransportService} from '../lib/service';
import {AuthService,cookieName} from '../lib/auth';
import {summaryFilters,buildRecordSummary,loadRecordSummary} from '../lib/record-summary';
import {recordSummaryFile} from '../lib/record-summary-export';
import {env} from './mocks/cloudflare';
import * as route from '../app/api/account-summary/route';
import ExcelJS from 'exceljs';
import {PDFDocument} from 'pdf-lib';
import {writeFileSync,mkdirSync} from 'node:fs';
const params=(kind='consignments',extra='')=>summaryFilters(new URLSearchParams('year=2026-2027&kind='+kind+extra));
const state={consignments:[
 {id:'c1',cn:'001',date:'2026-10-01',company:'A',truck:'BR1',origin:'Patna',destination:'Delhi',method:'Billed',freight:10000,advance:1000,invoice_id:'i1',invoice_number:1,stage_status:'complete'},
 {id:'c2',cn:'002',date:'2026-10-02',company:'A',truck:'BR2',origin:'Ranchi',destination:'Mumbai',method:'To Pay',freight:20000,advance:0,invoice_id:'i1',invoice_number:1,stage_status:'in_progress'},
 {id:'c3',cn:'003',date:'2026-10-03',company:'B',truck:'BR3',origin:'Patna',destination:'Delhi',method:'To Pay',freight:5000,advance:0,stage_status:'initiated'},
 {id:'c4',cn:'004',date:'2026-10-04',company:'B',truck:'BR4',origin:'Patna',destination:'Delhi',method:'Billed',freight:5000,advance:0,invoice_id:'i2',invoice_number:2,stage_status:'complete'},
 ],invoices:[{id:'i1',number:1,date:'2026-10-05',company:'A',total:29000,received_amount:10000,paid:0},{id:'i2',number:2,date:'2026-10-06',company:'B',total:5000,received_amount:6000,paid:1}],companies:[{name:'Empty company'}]};

test('separate terms/invoicing/payment filters and company totals use only matching consignments',()=>{
 const r=buildRecordSummary(state,params('consignments','&company=A&method=Billed&invoicing=invoiced&payment=pending&from=2026-10-01&to=2026-10-01'));
 expect(r.rows.map(c=>c.number)).toEqual(['001']);expect(r.totals).toMatchObject({count:1,freight:10000,advance:1000,balance:9000,invoiced:1});expect(r.groups[0].freight).toBe(10000);expect(r.options.companies).toContain('Empty company');
 expect(buildRecordSummary(state,params('consignments','&invoicing=not-invoiced&method=To+Pay')).rows.map(c=>c.number)).toEqual(['003']);
 expect(buildRecordSummary(state,params('consignments','&payment=paid')).rows.map(c=>c.number)).toEqual(['004']);
});
test('invoice operational filters match one linked consignment; complete invoice is counted once with no excess offset',()=>{
 const report=buildRecordSummary(state,params('invoices','&origin=Patna&method=Billed'));
 expect(report.totals).toMatchObject({count:2,total:34000,received:16000,remaining:19000,excess:1000});
 expect(buildRecordSummary(state,params('invoices','&truck=BR1&origin=Ranchi')).rows).toHaveLength(0);
 expect(buildRecordSummary(state,params('invoices','&company=A&payment=part-paid')).totals.total).toBe(29000);
 expect(buildRecordSummary(state,params('invoices','&from=2026-10-01&to=2026-10-02')).rows).toHaveLength(0);
});
test('invalid dates/ranges/statuses reject rather than exporting a different scope',()=>{
 for(const query of ['&from=2026-02-01','&from=2026-02-30','&from=2026-11-02&to=2026-10-01','&payment=bogus','&stage=bogus'])expect(()=>params('consignments',query)).toThrow();
 expect(()=>params('invoices','&invoicing=not-invoiced')).toThrow();
});
test('CSV/XLSX/PDF contain matching totals and preserve safe text; PDF wraps multi-page record cells',async()=>{
 const fixture=structuredClone(state);fixture.consignments[0].company='=HYPERLINK("https://bad.test")';const report=buildRecordSummary(fixture,params('consignments','&truck=BR1'));
 const csv=await recordSummaryFile(report,'csv'),text=new TextDecoder().decode(csv.bytes);expect(text).toContain("'=HYPERLINK");expect(text).toContain('"100"');expect(text).not.toContain('"BR2"');
 const xlsx=await recordSummaryFile(report,'xlsx'),book=new ExcelJS.Workbook();await book.xlsx.load(xlsx.bytes as any);expect(book.worksheets).toHaveLength(2);expect(book.getWorksheet('Records')!.getCell('C5').value).toBe('=HYPERLINK("https://bad.test")');expect(book.getWorksheet('Records')!.getCell('I5').value).toBe(100);
 const invoice=buildRecordSummary(state,params('invoices'));invoice.rows[0].consignments='Long consignment reference '.repeat(500);const pdf=await recordSummaryFile(invoice,'pdf'),doc=await PDFDocument.load(pdf.bytes);expect(doc.getPageCount()).toBeGreaterThan(2);mkdirSync('outputs',{recursive:true});writeFileSync('outputs/summary-preview.pdf',pdf.bytes);
});
test('owner summary query is tenant scoped, read-only and preserves issued amounts and snapshots',async()=>{
 const f=database();try{const auth=new AuthService(f.db),token=await auth.signup('summary-owner@tms.test','Eight123','Synthetic reports','qa-summary'),user=(await auth.user(cookieName()+'='+token))!,svc=new TransportService(f.db,user);
 await svc.command('consignment.save',{year:'2026-2027',cn:'R1',date:'2026-10-01',company:'Synthetic A',truck:'BR01AA1',origin:'Patna',destination:'Delhi',freight:1000,advance:100,method:'Billed'});
 const cn=(await svc.rows('SELECT id FROM consignments'))[0];await svc.command('invoice.create',{year:'2026-2027',date:'2026-10-02',ids:[cn.id],taxMode:'none'});
 const before=f.sqlite.prepare('SELECT total,snapshot FROM invoices').get(),changes=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
 const report=await loadRecordSummary(svc,params('invoices'));expect(report.totals.total).toBe(90000);expect(f.sqlite.prepare('SELECT total,snapshot FROM invoices').get()).toEqual(before);expect(f.sqlite.prepare('SELECT total_changes() n').get()!.n).toBe(changes);
 const other=await auth.signup('summary-other@tms.test','Eight123','Other workspace','other-ip'),otherUser=(await auth.user(cookieName()+'='+other))!;expect((await loadRecordSummary(new TransportService(f.db,otherUser),params('consignments'))).rows).toHaveLength(0);
 Object.assign(env,{DB:f.db});const request=(query='',cookie=cookieName()+'='+token)=>route.GET(new Request('https://unit.test/api/account-summary?year=2026-2027&kind=invoices'+query,{headers:{cookie}}));
 expect((await request('','')).status).toBe(401);expect((await request('',cookieName()+'='+token+'; logistrace_support=anything')).status).toBe(403);expect((await request('&format=csv')).headers.get('content-type')).toContain('text/csv');expect((await request('&format=pdf')).status).toBe(200);expect((await request('&format=bad')).status).toBe(400);
 for(const role of ['MEMBER','DISPATCHER']){f.sqlite.prepare('UPDATE memberships SET role=? WHERE user_id=?').run(role,user.userId);expect((await request('')).status).toBe(403);}
 }finally{f.sqlite.close();delete env.DB;}
});
