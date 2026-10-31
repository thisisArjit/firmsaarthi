import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const folder='.sites-runtime/migration-files';await mkdir(folder,{recursive:true});
if(process.stdin.isTTY)process.stdin.setRawMode(true);process.stdin.setEncoding('utf8');
console.log('Ready for authenticated file references on hidden stdin.');
let buffer='',chain=Promise.resolve();const manifest=[];
process.stdin.on('data',chunk=>{buffer+=chunk;let newline;while((newline=buffer.search(/[\r\n]/))>=0){const line=buffer.slice(0,newline).trim();buffer=buffer.slice(newline+1);if(!line)continue;chain=chain.then(async()=>{
  const item=JSON.parse(line);if(item.done){await writeFile('.sites-runtime/migration-file-manifest.json',JSON.stringify(manifest));console.log(JSON.stringify({complete:true,files:manifest.length,bytes:manifest.reduce((s,f)=>s+f.size,0)}));process.exit(0);}
  if(!/^[\w-]+$/.test(item.id))throw new Error('Invalid file ID');
  const url=new URL(item.file_uri.download_url);if(url.protocol!=='https:'||!url.hostname.endsWith('.oaiusercontent.com'))throw new Error('Unexpected file materialization host');
  const response=await fetch(url);if(!response.ok)throw new Error(`File download failed (${response.status})`);
  const data=Buffer.from(await response.arrayBuffer());if(data.length!==Number(item.size))throw new Error(`File length mismatch: ${item.id}`);
  if(item.mime==='application/pdf'&&data.subarray(0,5).toString()!=='%PDF-')throw new Error('Not a PDF');
  await writeFile(`${folder}/${item.id}`,data);manifest.push({id:item.id,name:item.name,mime:item.mime,size:data.length,sha256:createHash('sha256').update(data).digest('hex')});
  console.log(JSON.stringify({downloaded:manifest.length,id:item.id,bytes:data.length}));
}).catch(error=>{console.error(error.message);process.exit(1);});}});
