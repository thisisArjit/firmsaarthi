import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
export async function summaryPdf(title:string,filters:string,note:string,tables:{headers:string[];rows:unknown[][];groupHeaders:string[];groupRows:unknown[][]}){
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
 const safe=(v:unknown)=>String(v??'').replace(/₹/g,'INR ').replace(/[–—]/g,'-').normalize('NFKD').replace(/[^\x20-\x7e]/g,'?');
 const wrap=(value:unknown,width:number,size=8)=>{const result:string[]=[];let current='';for(const char of safe(value)){if(font.widthOfTextAtSize(current+char,size)>width&&current){result.push(current);current=char;}else current+=char;}result.push(current);return result;};
 let page:any,y=0;
 const start=()=>{page=doc.addPage([1190,842]);y=800;page.drawText(title,{x:32,y,size:17,font:bold});y-=20;for(const line of wrap(filters,1120,9)){page.drawText(line,{x:32,y,size:9,font});y-=13;}y-=10;};
 function table(headers:string[],rows:unknown[][],label:string){
  const weights=headers.map(h=>h==='Company'?2.2:h==='Consignments'?2:h.includes('status')||h.includes('payment')?1.5:1),total=weights.reduce((n,w)=>n+w,0),widths=weights.map(w=>1126*w/total);
  const draw=(cells:unknown[],heading=false)=>{
   const lines=cells.map((v,i)=>wrap(typeof v==='number'?v.toLocaleString('en-IN',{maximumFractionDigits:2,minimumFractionDigits:headers[i].endsWith(' INR')?2:0}):v,widths[i]-10)),count=Math.max(...lines.map(l=>l.length));let offset=0;
   while(offset<count){if(y<70){start();if(!heading)draw(headers,true);}const take=Math.min(count-offset,Math.max(1,Math.floor((y-44-12)/11))),height=take*11+12;if(heading)page.drawRectangle({x:32,y:y-height,width:1126,height,color:rgb(.91,.94,.96)});let x=32;lines.forEach((ls,i)=>{ls.slice(offset,offset+take).forEach((s,j)=>page.drawText(s,{x:x+4,y:y-11-j*11,size:8,font:heading?bold:font}));x+=widths[i];});y-=height;offset+=take;if(offset<count){start();if(!heading)draw(headers,true);}}
  };
  start();page.drawText(label,{x:32,y,size:11,font:bold});y-=18;draw(headers,true);for(const row of rows)draw(row);
 }
 table(tables.groupHeaders,tables.groupRows,'Company totals');table(tables.headers,tables.rows,'Matching records');
 for(const line of wrap(note,1120,9)){if(y<50)start();page.drawText(line,{x:32,y:y-15,size:9,font});y-=13;}
 doc.getPages().forEach((p,i)=>p.drawText(`FirmSaarthi | INR | Page ${i+1} of ${doc.getPageCount()}`,{x:32,y:22,size:8,font}));return doc.save();
}
