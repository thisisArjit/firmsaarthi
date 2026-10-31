import {SiteError} from './site-domain';
export async function boundedBody(request:Request,max=100000){
  if(Number(request.headers.get('content-length')||0)>max)throw new SiteError('Request too large.',413);
  const reader=request.body?.getReader();if(!reader)return new Uint8Array();const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new SiteError('Request too large.',413);}chunks.push(value);}}finally{reader.releaseLock();}
  const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}return body;
}
export async function boundedJson(request:Request,max=100000){try{return JSON.parse(new TextDecoder().decode(await boundedBody(request,max))) as Record<string,any>;}catch(e){if(e instanceof SiteError)throw e;throw new SiteError('Invalid request. Please check your details.');}}
export async function boundedForm(request:Request){const bytes=await boundedBody(request,6*1024*1024);return new Request(request.url,{method:'POST',headers:{'Content-Type':request.headers.get('content-type')||''},body:bytes}).formData();}
