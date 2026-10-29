// RFC 4180 CSV and ZIP (stored entries) for bounded accountant downloads.
export type ExportFile={name:string;type:string;bytes:Uint8Array;rows?:number};
export const utf8=(s:string)=>new TextEncoder().encode(s);
export function csv(columns:string[],rows:unknown[][]){
 const cell=(value:unknown)=>{let s=String(value??'');if(typeof value==='string'&&!/^-?\d+(?:\.\d+)?$/.test(s)&&/^[\s\u0000-\u001f]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
 return utf8('\uFEFF'+[columns,...rows].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n');
}
function crc32(bytes:Uint8Array){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
export function zipFiles(files:ExportFile[]){
 if(files.length>100||files.some(f=>!/^[-a-z0-9_.]+$/i.test(f.name))||new Set(files.map(f=>f.name)).size!==files.length)throw Error('Invalid export files.');
 const size=files.reduce((n,f)=>n+f.bytes.length+76+utf8(f.name).length*2,22);if(size>12*1024*1024)throw Error('Export is too large. Choose a shorter period.');
 const out=new Uint8Array(size),view=new DataView(out.buffer);let p=0;const central:{file:ExportFile;offset:number;crc:number}[]=[];
 const u16=(n:number)=>{view.setUint16(p,n,true);p+=2;},u32=(n:number)=>{view.setUint32(p,n,true);p+=4;},bytes=(b:Uint8Array)=>{out.set(b,p);p+=b.length;};
 for(const file of files){const name=utf8(file.name),crc=crc32(file.bytes);central.push({file,offset:p,crc});u32(0x04034b50);u16(20);u16(0x800);u16(0);u16(0);u16(33);u32(crc);u32(file.bytes.length);u32(file.bytes.length);u16(name.length);u16(0);bytes(name);bytes(file.bytes);}
 const start=p;for(const {file,offset,crc} of central){const name=utf8(file.name);u32(0x02014b50);u16(20);u16(20);u16(0x800);u16(0);u16(0);u16(33);u32(crc);u32(file.bytes.length);u32(file.bytes.length);u16(name.length);u16(0);u16(0);u16(0);u16(0);u32(0);u32(offset);bytes(name);}
 const length=p-start;u32(0x06054b50);u16(0);u16(0);u16(files.length);u16(files.length);u32(length);u32(start);u16(0);return out;
}
