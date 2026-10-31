import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib';
import type { Row } from './domain';
import {customInvoicePdf} from './invoice-template-pdf';
import {originalInvoicePdf,ORIGINAL_INVOICE_LAYOUT} from './original-invoice-pdf';
const clean=(v:unknown)=>String(v??'').replace(/₹/g,'INR ').replace(/[–—]/g,'-').normalize('NFKD').replace(/[^\x20-\x7E\n]/g,'');
const amt=(n:number)=>`INR ${(n/100).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
export async function makePdf(title:string,columns:string[],rows:unknown[][],footer:string[] = []) {
  const doc=await PDFDocument.create();const regular=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
  let page!:PDFPage,y=0;const width=columns.length>8?842:595,height=columns.length>8?595:842;
  const add=()=>{page=doc.addPage([width,height]);y=height-45;page.drawText(clean(title).slice(0,100),{x:32,y,size:17,font:bold,color:rgb(.12,.2,.31)});y-=24;page.drawText(`Generated ${new Date().toISOString().slice(0,10)} | Transport Desk`,{x:32,y,size:9,font:regular});y-=28;};
  add();const cellWidth=(width-64)/columns.length;
  const drawRow=(cells:unknown[],heading=false)=>{if(y<60){add();drawRow(columns,true);}if(heading)page.drawRectangle({x:30,y:y-6,width:width-60,height:21,color:rgb(.91,.94,.96)});cells.forEach((v,i)=>{const text=clean(v);const max=Math.max(5,Math.floor(cellWidth/4.1));page.drawText(text.length>max?text.slice(0,max-2)+'..':text,{x:34+i*cellWidth,y,size:8,font:heading?bold:regular});});y-=23;};
  drawRow(columns,true);for(const row of rows)drawRow(row);for(const text of footer){if(y<50)add();page.drawText(clean(text).slice(0,135),{x:34,y:y-8,size:10,font:bold});y-=21;}
  doc.getPages().forEach((p,i)=>p.drawText(`${i+1} / ${doc.getPageCount()}`,{x:width-65,y:22,size:8,font:regular}));return doc.save();
}
export async function invoicePdf(invoice:Row, images:Record<string,Uint8Array>={}) {
  if(invoice.snapshot.template)return customInvoicePdf(invoice,images);
  if(invoice.snapshot.defaultLayout===ORIGINAL_INVOICE_LAYOUT)return originalInvoicePdf(invoice,images);
  const s=invoice.snapshot;const doc=await PDFDocument.create();const regular=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
  let page!:PDFPage,y=0;
  const text=(v:unknown,x=38,size=10,strong=false)=>{page.drawText(clean(v),{x,y,size,font:strong?bold:regular,color:rgb(.12,.19,.28)});};
  const line=(v:unknown,size=10,strong=false)=>{if(y<65)newPage();const raw=clean(v);const max=size>15?48:95;for(let i=0;i<raw.length||i===0;i+=max){text(raw.slice(i,i+max),38,size,strong);y-=size+7;}};
  const newPage=()=>{page=doc.addPage([595,842]);y=802;text(s.profile.transportName||'Transport Business',38,19,true);y-=25;text(`TAX INVOICE  |  ${invoice.year} / ${invoice.number}  |  Revision ${invoice.revision}`,38,10,true);y-=26;};
  newPage();line(s.profile.address||'');line(`Contact: ${s.profile.contactNumber||'-'}  |  GSTIN: ${s.profile.gst||'-'}`);line(`Invoice date: ${invoice.date}`);
  if(images.logo){try{const image=await doc.embedPng(images.logo).catch(()=>doc.embedJpg(images.logo));const dim=image.scaleToFit(60,40);page.drawImage(image,{x:495,y:786,width:dim.width,height:dim.height});}catch{}}
  y-=7;line(`Bill to: ${s.party.name}`,12,true);line(s.party.address||'');line(`Party GSTIN: ${s.party.gst||'-'}`);y-=8;
  const header=()=>{line('Date / C. No.              Route / Truck                    Rate       Weight       Freight',9,true);};header();
  for(const r of s.items){if(y<120){newPage();header();}line(`${r.date}  /  ${r.cn}`,10,true);line(`${r.origin} to ${r.destination} | Truck: ${r.truck}`);line(`Rate: ${r.rate_label||amt(r.rate)}    Weight: ${r.weight}    Freight: ${amt(r.freight)}    Advance: ${amt(r.advance)}`,9);y-=5;}
  if(s.charges.length){line('OTHER CHARGES',11,true);for(const c of s.charges)line(`${c.date||''} ${c.cn||''} ${c.description}: ${amt(c.amount)}`);}
  y-=10;for(const [label,key]of [['Freight total','freight'],['Other charges','other'],['Subtotal','subtotal'],['Less advance','advance'],['Balance before tax','balance'],['IGST (5%)','igst'],['CGST (2.5%)','cgst'],['SGST (2.5%)','sgst'],['AMOUNT DUE','total']])line(`${label}: ${amt(s.totals[key])}`,key==='total'?15:10,key==='total');
  if(s.paidBy)line(`Paid by ${s.paidBy}; GST not applied.`);line(`Status: ${invoice.paid?'PAID':'UNPAID'}`);
  for(const [k,label]of [['partyInvoiceNumber','Party invoice'],['partyInvoiceDate','Party invoice date'],['workOrderNumber','Work order']])if(s.references[k])line(`${label}: ${s.references[k]}`);
  y-=8;line('BANK DETAILS',11,true);for(const [k,label]of [['bankName','Bank'],['acName','A/c name'],['acNumber','A/c number'],['ifscCode','IFSC'],['swiftCode','SWIFT']])if(s.profile[k])line(`${label}: ${s.profile[k]}`);
  if(images.qr){try{if(y<170)newPage();const image=await doc.embedPng(images.qr).catch(()=>doc.embedJpg(images.qr));const dim=image.scaleToFit(100,100);page.drawImage(image,{x:450,y:y-100,width:dim.width,height:dim.height});y-=110;}catch{}}
  line(`For ${s.profile.transportName||'Transport Business'} - Authorized signatory`,10,true);
  doc.getPages().forEach((p,i)=>p.drawText(`Invoice ${invoice.number} | ${invoice.year} | Page ${i+1} of ${doc.getPageCount()}`,{x:38,y:24,size:8,font:regular}));return doc.save();
}
