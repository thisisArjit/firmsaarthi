import {PDFDocument,StandardFonts,rgb,type PDFPage} from 'pdf-lib';
import type {Row} from './domain';

// Versioned transcription of ../InvoiceTemplate.html. Dimensions are CSS px × .75
// on A4, including the original asymmetric page/container margins. No accounting
// is performed here: every displayed amount comes from the issued snapshot.
export const ORIGINAL_INVOICE_LAYOUT='stta-html-v1';
const ascii=(value:unknown)=>String(value??'').replace(/[–—]/g,'-').normalize('NFKD').replace(/[^\x20-\x7E\n₹]/g,'');
const decimal=(paise:unknown)=>(Number(paise||0)/100).toFixed(2);
export function originalInvoiceDate(value:unknown){const text=String(value||''),m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(text);return m?`${m[3]}-${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m[2])-1]}-${m[1]}`:text;}
export function invoiceAmountInWords(paise:number){
  const ones=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
  const tens=['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
  const words=(n:number):string=>{if(n<20)return ones[n];if(n<100)return tens[Math.floor(n/10)]+(n%10?' '+ones[n%10]:'');if(n<1000)return ones[Math.floor(n/100)]+' hundred'+(n%100?' and '+words(n%100):'');for(const [unit,label]of [[10000000,'crore'],[100000,'lakh'],[1000,'thousand']] as const)if(n>=unit)return words(Math.floor(n/unit))+' '+label+(n%unit?' '+words(n%unit):'');return '';};
  const rounded=Math.max(0,Math.round(paise)),whole=Math.floor(rounded/100),fraction=rounded%100,text=words(whole);
  return text[0].toUpperCase()+text.slice(1)+' Rupees'+(fraction?' and '+words(fraction)+' Paise':'')+' Only.';
}

export async function originalInvoicePdf(invoice:Row,images:Record<string,Uint8Array>={}){
  const s=invoice.snapshot,doc=await PDFDocument.create(),normal=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setSubject(ORIGINAL_INVOICE_LAYOUT);
  const W=595.276,H=841.89,left=21.132,right=40.346,width=W-left-right,bottom=28.35;
  const ink=rgb(.122,.161,.216),muted=rgb(.42,.45,.50),border=rgb(.82,.835,.86),soft=rgb(.953,.957,.965),tint=rgb(.976,.98,.984);
  let page!:PDFPage,y=0;
  const font=(strong=false)=>strong?bold:normal;
  const measure=(text:string,size:number,strong=false)=>text.split('₹').reduce((sum,part,i)=>sum+font(strong).widthOfTextAtSize(part,size)+(i?size*.62:0),0);
  const draw=(value:unknown,x:number,baseline:number,size=8.25,strong=false,color=ink)=>{
    const parts=ascii(value).split('₹');let at=x;
    for(let i=0;i<parts.length;i++){
      if(i){const k=size/100;const segment=(a:number,b:number,c:number,d:number)=>page.drawLine({start:{x:at+a*k,y:baseline+b*k},end:{x:at+c*k,y:baseline+d*k},thickness:size*(strong?.085:.065),color});segment(0,72,55,72);segment(0,53,55,53);segment(14,72,32,64);segment(32,64,34,49);segment(34,49,22,36);segment(22,36,1,36);segment(1,36,50,0);at+=size*.62;}
      page.drawText(parts[i],{x:at,y:baseline,size,font:font(strong),color});at+=measure(parts[i],size,strong);
    }
  };
  const wrap=(value:unknown,max:number,size=8.25,strong=false)=>{
    const lines:string[]=[];for(const paragraph of ascii(value).split('\n')){let line='';for(const word of paragraph.split(/\s+/).filter(Boolean)){if(line&&measure(line+' '+word,size,strong)>max){lines.push(line);line='';}let remaining=word;while(measure(remaining,size,strong)>max&&remaining.length>1){let cut=remaining.length-1;while(cut>1&&measure(remaining.slice(0,cut),size,strong)>max)cut--;if(line){lines.push(line);line='';}lines.push(remaining.slice(0,cut));remaining=remaining.slice(cut);}line+=(line?' ':'')+remaining;}lines.push(line);}return lines;
  };
  const rightText=(text:unknown,x:number,baseline:number,size=8.25,strong=false,color=ink)=>draw(text,x-measure(ascii(text),size,strong),baseline,size,strong,color);
  const box=(x:number,top:number,w:number,h:number,fill=tint)=>page.drawRectangle({x,y:top-h,width:w,height:h,color:fill,borderColor:border,borderWidth:.75});
  const rule=(x:number,top:number,w:number,color=border,thickness=.75)=>page.drawLine({start:{x,y:top},end:{x:x+w,y:top},color,thickness});
  const logo=images.logo?await doc.embedPng(images.logo).catch(()=>doc.embedJpg(images.logo)).catch(()=>null):null;
  const qr=images.qr?await doc.embedPng(images.qr).catch(()=>doc.embedJpg(images.qr)).catch(()=>null):null;
  const header=()=>{
    page=doc.addPage([W,H]);y=H-41.846;
    let brandX=left;if(logo){const d=logo.scaleToFit(43.5,43.5);page.drawImage(logo,{x:left+(43.5-d.width)/2,y:y-43.5+(43.5-d.height)/2,width:d.width,height:d.height});brandX+=52.5;}
    const name=wrap(s.profile.transportName||'TRANSPORT COMPANY NAME',width*.66-(brandX-left),18,true);let at=y-18;
    for(const line of name){draw(line,brandX,at,18,true);at-=20.7;}
    at+=1.5; // Account for the heading baseline before the 10px metadata margin.
    for(const value of [s.profile.address,s.profile.contactNumber,s.profile.gst?'GSTIN: '+s.profile.gst:''].filter(Boolean)){for(const line of wrap(value,width*.66-(brandX-left),8.25)){draw(line,brandX,at);at-=12.3;}}
    const infoX=left+width;
    const invoiceNumber=String(invoice.number),date=originalInvoiceDate(invoice.date);
    draw('Invoice No: ',infoX-measure(invoiceNumber,12)-measure('Invoice No: ',12,true),y-12,12,true);rightText(invoiceNumber,infoX,y-12,12);
    draw('Date: ',infoX-measure(date,8.25)-measure('Date: ',8.25,true),y-27,8.25,true);rightText(date,infoX,y-27,8.25);
    const end=Math.min(at+5.5,logo?y-43.5:at+5.5,y-35);rule(left,end-15,width,ink,1.5);y=end-15-22.5;
  };
  const ensure=(height:number)=>{if(y-height<bottom)header();};
  header();
  const billLines=[['Bill to: '+s.party.name,true],[s.party.address||'',false],['GST: '+(s.party.gst||''),false]] as const;
  const billRows=billLines.flatMap(([value,strong])=>wrap(value,width-15,8.25,false).map(text=>({text,strong})));
  const billHeight=billRows.length*11.8+12;box(left,y,width,billHeight);let by=y-14;
  for(const row of billRows){if(row.text.startsWith('Bill to: ')){draw('Bill to: ',left+7.5,by,8.25,true);draw(row.text.slice(9),left+7.5+measure('Bill to: ',8.25,true),by);}else draw(row.text,left+7.5,by,8.25,false);by-=11.8;}y-=billHeight+22.5;

  function table(columns:{label:string;fraction:number;align?:'right'}[],records:{text:string;strong?:boolean;color?:ReturnType<typeof rgb>}[][]){
    const widths=columns.map(c=>c.fraction*width),padding=4.5,lineHeight=9.9;
    // HTML's nowrap consignment-number column expands for longer references.
    if(columns.length===6){const required=Math.min(width*.20,Math.max(widths[1],...records.map(r=>measure(r[1].text,8.25,true)+9.75))),extra=required-widths[1];widths[1]=required;widths[2]-=extra*.65;for(const index of [0,3,4,5])widths[index]-=extra*.35*columns[index].fraction/.52;}
    const cells=(values:{text:string;strong?:boolean;color?:ReturnType<typeof rgb>}[],heading=false)=>values.map((v,i)=>({...v,lines:wrap(v.text,widths[i]-padding*2,heading?7.5:8.25,heading||v.strong)}));
    const headerCells=columns.map(c=>({text:c.label})),headerH=Math.max(...cells(headerCells,true).map(c=>c.lines.length))*9+8.1;
    function paint(values:ReturnType<typeof cells>,height:number,heading=false){let x=left;for(let i=0;i<values.length;i++){
      page.drawRectangle({x,y:y-height,width:widths[i],height,color:heading?soft:rgb(1,1,1),borderWidth:.75,borderColor:rgb(.933,.933,.933)});
      values[i].lines.forEach((line,j)=>{const size=heading?7.5:8.25,baseline=y-3.75-size-j*(heading?9:lineHeight);if(columns[i].align==='right')rightText(line,x+widths[i]-padding,baseline,size,heading||values[i].strong,values[i].color||ink);else draw(line,x+padding,baseline,size,heading||values[i].strong,values[i].color||ink);});x+=widths[i];
    }y-=height;}
    const headings=()=>paint(cells(headerCells,true),headerH,true);
    ensure(headerH+30);headings();
    for(const values of records){const wrapped=cells(values),height=Math.max(...wrapped.map(c=>c.lines.length))*lineHeight+8.1;
      if(height>H-230)throw new Error('Invoice row is too tall. Shorten its description before issuing.');
      if(y-height<bottom){header();headings();}paint(wrapped,height);
    }
  }
  table([{label:'DATE',fraction:.13},{label:'C. NO',fraction:.09},{label:'DETAILS',fraction:.39},{label:'RATE (₹)',fraction:.10,align:'right'},{label:'WEIGHT (TON/PC)',fraction:.11,align:'right'},{label:'FREIGHT (₹)',fraction:.18,align:'right'}],s.items.map((r:Row)=>[
    {text:originalInvoiceDate(r.date)},{text:String(r.cn),strong:true},{text:r.origin+' to '+r.destination+'\nLorry no: '+r.truck},{text:r.rate_label||decimal(r.rate)},{text:Number.isFinite(Number(r.weight))?Number(r.weight).toFixed(2):String(r.weight||'')},{text:decimal(r.freight)}
  ]));
  if(s.charges?.length){ensure(65);y-=15;draw('Other Charges',left,y-9,9,true);y-=17.4;rule(left,y,width);y-=7.5;table([{label:'DATE',fraction:.15},{label:'C.NO',fraction:.15},{label:'DESCRIPTION',fraction:.55},{label:'AMOUNT (₹)',fraction:.15,align:'right'}],s.charges.map((r:Row)=>[{text:originalInvoiceDate(r.date)},{text:r.cn||''},{text:r.description},{text:decimal(r.amount)}]));}

  const references=[['Party Invoice Number',s.references?.partyInvoiceNumber||''],['Dated',originalInvoiceDate(s.references?.partyInvoiceDate)],['Work Order Number',s.references?.workOrderNumber||''],['GST Paid By',s.paidBy==='consignor'?'Consignor':s.paidBy==='consignee'?'Consignee':'']];
  const totals=[['Subtotal',s.totals.subtotal],...(s.totals.advance>0?[['Less: Advance',s.totals.advance]]:[]),...(['igst','cgst','sgst'] as const).filter(k=>s.totals[k]>0).map(k=>[k.toUpperCase()+(k==='igst'?' (5%)':' (2.5%)'),s.totals[k]])];
  const inner=width-18,refWidth=inner*.34-13.5,totalWidth=inner*.56-13.5;
  const pairs=(rows:unknown[][],x:number,w:number,top:number)=>{let cursor=top;for(const [label,value]of rows){const text=ascii(value),labelWidth=measure(String(label),8.25);if(labelWidth+measure(text,8.25,true)+8<=w){draw(label,x,cursor,8.25,false,muted);rightText(text,x+w,cursor,8.25,true);cursor-=13;}else{draw(label,x,cursor,8.25,false,muted);cursor-=12;for(const part of wrap(text,w,8.25,true)){rightText(part,x+w,cursor,8.25,true);cursor-=11;}cursor-=2;}}return cursor;};
  // Measure first, so the references/summary and bank/signature blocks never split.
  const refH=references.reduce((n,[label,value])=>n+(measure(String(label),8.25)+measure(String(value),8.25,true)+8<=refWidth?13:14+wrap(value,refWidth,8.25,true).length*11),0);
  const paidNote=s.paidBy?`GST not applied because it is marked as paid by ${s.paidBy==='consignor'?'Consignor':'Consignee'}.`:'';
  const words='In words: '+invoiceAmountInWords(s.totals.total),noteLines=[...paidNote?wrap(paidNote,totalWidth,7.5):[],...wrap(words,totalWidth,7.5)];
  const summaryHeight=Math.max(90,25+refH,25+totals.length*13+32.5+noteLines.length*10)+15;
  const bankRows=[['A/C Name:',s.profile.acName],['A/C No:',s.profile.acNumber],['Bank:',s.profile.bankName],['IFSC Code:',s.profile.ifscCode],['SWIFT Code:',s.profile.swiftCode]],bankW=width*.575,copyW=(bankW-15)*.74;
  const bankLines=bankRows.flatMap(([label,value])=>wrap(label+' '+(value||''),copyW,7.5)),bankH=Math.max(qr?82:66,20+bankLines.length*10);
  y-=18.75;if(y-summaryHeight-30-bankH<bottom)header();
  const top=y;box(left,top,width,summaryHeight);const divider=left+width*.38;
  page.drawLine({start:{x:divider,y:top-10.5},end:{x:divider,y:top-summaryHeight+10.5},color:border,thickness:.75});
  draw('REFERENCES',left+9,top-16,9,true);pairs(references,left+9,refWidth,top-32);
  const tx=left+width-9-totalWidth;draw('INVOICE SUMMARY',tx,top-16,9,true);
  let ty=pairs(totals.map(([label,value])=>[label,'₹'+decimal(value)]),tx,totalWidth,top-32);rule(tx,ty-5,totalWidth);ty-=18.5;draw('Grand Total',tx,ty,9.75);rightText('₹'+decimal(s.totals.total),left+width-9,ty,9.75,true);ty-=21;
  for(const line of noteLines){draw(line,tx,ty,7.5,false,muted);ty-=10;}y-=summaryHeight+30;
  ensure(bankH);box(left,y,bankW,bankH);draw('Bank Details:',left+7.5,y-13.5,7.5,true);let fy=y-25;
  for(const line of bankLines){draw(line,left+7.5,fy,7.5);fy-=10;}
  const qrX=left+bankW-7.5-58;if(qr){const d=qr.scaleToFit(58,58);page.drawImage(qr,{x:qrX+(58-d.width)/2,y:y-7.5-d.height,width:d.width,height:d.height});draw('Scan & pay',qrX,y-7.5-d.height-10,7.5);}else{for(const [i,line]of wrap('QR code not uploaded.',58,7.5).entries())draw(line,qrX,y-17-i*10,7.5);}
  let sy=y-33;for(const line of wrap('For '+(s.profile.transportName||''),width-bankW-8,7.5,true)){rightText(line,left+width,sy,7.5,true);sy-=10;}
  sy-=10;rightText('_________________________',left+width,sy,7.5);rightText('Electronically generated invoice. No signature required.',left+width,sy-14,6.375);
  if(doc.getPageCount()>1)doc.getPages().forEach((p,i)=>p.drawText(`Invoice ${invoice.number} | ${i+1} / ${doc.getPageCount()}`,{x:left,y:14,size:7,font:normal,color:muted}));
  return doc.save();
}
