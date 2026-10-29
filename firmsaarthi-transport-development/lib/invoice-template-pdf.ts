import {PDFDocument,StandardFonts,rgb,type PDFPage} from 'pdf-lib';
import {validateInvoiceTemplate} from './invoice-template';
import type {Row} from './domain';
const clean=(v:unknown)=>String(v??'').replace(/₹/g,'INR ').replace(/[–—]/g,'-').normalize('NFKD').replace(/[^\x20-\x7E\n]/g,'');
const amount=(v:number)=>'INR '+(v/100).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
export async function customInvoicePdf(invoice:Row,images:Record<string,Uint8Array>={}){
  const s=invoice.snapshot,t=validateInvoiceTemplate(s.template),doc=await PDFDocument.create(),regular=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold),width=t.orientation==='portrait'?595:842,height=t.orientation==='portrait'?842:595,margin=36,available=width-margin*2;
  const accent=rgb(...[1,3,5].map(i=>parseInt(t.accent.slice(i,i+2),16)/255) as [number,number,number]);
  const wrap=(value:unknown,max:number,size:number,strong=false)=>{const font=strong?bold:regular,result:string[]=[];for(const paragraph of clean(value).split('\n')){let line='';for(const word of paragraph.split(/\s+/)){if(line&&font.widthOfTextAtSize(line+' '+word,size)>max){result.push(line);line='';}let rest=word;while(font.widthOfTextAtSize(rest,size)>max&&rest.length>1){let n=rest.length-1;while(n>1&&font.widthOfTextAtSize(rest.slice(0,n),size)>max)n--;if(line){result.push(line);line='';}result.push(rest.slice(0,n));rest=rest.slice(n);}line+=(line?' ':'')+rest;}result.push(line);}return result;};
  let page!:PDFPage,y=0;
  const newPage=()=>{page=doc.addPage([width,height]);y=height-margin;for(const line of wrap(s.profile.transportName||'Transport Business',available-80,17,true)){page.drawText(line,{x:margin,y,size:17,font:bold,color:accent});y-=22;}for(const part of wrap(t.title+' | '+invoice.year+' / '+invoice.number+' | Revision '+invoice.revision,available,9,true)){page.drawText(part,{x:margin,y,size:9,font:bold,color:accent});y-=14;}y-=11;};
  const line=(value:unknown,size=10,strong=false)=>{for(const part of wrap(value,available,size,strong)){if(y<65)newPage();page.drawText(part,{x:margin,y,size,font:strong?bold:regular,color:rgb(.12,.19,.28)});y-=size+6;}};
  const heading=(value:string)=>{if(y<100)newPage();y-=8;line(value,11,true);};
  newPage();
  if(t.showLogo&&images.logo){try{const img=await doc.embedPng(images.logo).catch(()=>doc.embedJpg(images.logo)),d=img.scaleToFit(60,38);page.drawImage(img,{x:width-margin-60,y:height-margin-35,width:d.width,height:d.height});}catch{}}
  line(s.profile.address||'');line('Contact: '+(s.profile.contactNumber||'-')+' | GSTIN: '+(s.profile.gst||'-'));line('Invoice date: '+invoice.date);heading('Bill to: '+s.party.name);line(s.party.address||'');line('Party GSTIN: '+(s.party.gst||'-'));
  const weights:Record<string,number>={date:65,cn:55,route:135,truck:80,rate:85,weight:55,freight:90,advance:90},totalWeight=t.columns.reduce((n,k)=>n+weights[k],0),widths=t.columns.map(k=>available*weights[k]/totalWeight);
  const row=(values:unknown[],header=false)=>{const fontSize=8,cells=values.map((v,i)=>wrap(v,widths[i]-10,fontSize,header)),rowHeight=Math.max(...cells.map(v=>v.length))*12+12;if(rowHeight>height-140)throw new Error('Invoice row is too large for the selected layout. Choose fewer columns or landscape.');
    if(y-rowHeight<65){newPage();if(!header)row(t.columns.map(k=>t.labels[k]),true);}
    if(header)page.drawRectangle({x:margin,y:y-rowHeight+4,width:available,height:rowHeight,color:rgb(.93,.95,.97)});
    let x=margin;cells.forEach((lines,i)=>{lines.forEach((v,j)=>page.drawText(v,{x:x+5,y:y-8-j*12,size:fontSize,font:header?bold:regular,color:header?accent:rgb(.12,.19,.28)}));x+=widths[i];});y-=rowHeight;
  };
  for(const section of t.sections){
    if(section==='items'){heading('Consignments');row(t.columns.map(k=>t.labels[k]),true);for(const item of s.items){const cells:Row={...item,route:item.origin+' to '+item.destination,rate:item.rate_label||amount(item.rate),freight:amount(item.freight),advance:amount(item.advance)};row(t.columns.map(k=>cells[k]));}}
    if(section==='charges'&&s.charges.length){heading('Other charges');for(const charge of s.charges)line([charge.date,charge.cn,charge.description,amount(charge.amount)].filter(Boolean).join(' | '));}
    if(section==='totals'){heading('Totals');for(const [label,key]of [['Freight total','freight'],['Other charges','other'],['Subtotal','subtotal'],['Less advance','advance'],['Balance before tax','balance'],['IGST (5%)','igst'],['CGST (2.5%)','cgst'],['SGST (2.5%)','sgst'],['AMOUNT DUE','total']])line(label+': '+amount(s.totals[key]),key==='total'?14:10,key==='total');if(s.paidBy)line('Paid by '+s.paidBy+'; GST not applied.');line('Status: '+(invoice.paid?'PAID':'UNPAID'));}
    if(section==='references'){for(const [key,label]of [['partyInvoiceNumber','Party invoice'],['partyInvoiceDate','Party invoice date'],['workOrderNumber','Work order']])if(s.references[key])line(label+': '+s.references[key]);}
    if(section==='bank'){heading('Bank details');for(const [key,label]of [['bankName','Bank'],['acName','A/c name'],['acNumber','A/c number'],['ifscCode','IFSC'],['swiftCode','SWIFT']])if(s.profile[key])line(label+': '+s.profile[key]);if(t.showQr&&images.qr){try{if(y<180)newPage();const img=await doc.embedPng(images.qr).catch(()=>doc.embedJpg(images.qr)),d=img.scaleToFit(90,90);page.drawImage(img,{x:margin,y:y-95,width:d.width,height:d.height});y-=105;}catch{}}}
    if(section==='notes'&&t.notes){heading('Notes');line(t.notes);}
    if(section==='signature'){heading('For '+(s.profile.transportName||'Transport Business'));line(t.signature,10,true);}
  }
  doc.getPages().forEach((p,i)=>p.drawText(clean('Invoice '+invoice.number+' | '+invoice.year+' | Page '+(i+1)+' of '+doc.getPageCount()),{x:margin,y:24,size:8,font:regular}));return doc.save();
}
