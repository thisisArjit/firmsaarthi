import {vi} from 'vitest';
import {File as WebFile,Blob as WebBlob} from 'node:buffer';
import {webcrypto} from 'node:crypto';
import {apiFixture,routeHandlers} from './api';
export async function browserFixture(){
 const DOMFile=window.File;
 vi.stubGlobal('FormData',window.FormData);
 vi.stubGlobal('File',WebFile);vi.stubGlobal('Blob',WebBlob);
 const {Headers,Request,Response,FormData:WebFormData}=await import('undici');
 vi.stubGlobal('Request',Request);vi.stubGlobal('Response',Response);vi.stubGlobal('Headers',Headers);vi.stubGlobal('File',WebFile);vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('BroadcastChannel',undefined);Object.defineProperty(Element.prototype,'scrollIntoView',{value:vi.fn(),configurable:true});URL.createObjectURL=vi.fn(()=> 'blob:synthetic-test');URL.revokeObjectURL=vi.fn();
 const f=await apiFixture();const calls:{path:string;body:any}[]=[];
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init:RequestInit={})=>{const url=new URL(String(input),'https://local.test'),method=init.method||'GET';if(init.signal?.aborted)throw new DOMException('Aborted','AbortError');let body:any=init.body;const headers=new Headers(init.headers as any);headers.set('Cookie',f.getCookie());if(method!=='GET')headers.set('Origin','https://local.test');if(body&&typeof body!=='string'&&typeof body.entries==='function'){const form=new WebFormData();for(const [k,v]of body.entries()){if(typeof v==='string')form.set(k,v);else{const bytes=await new Promise<ArrayBuffer>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result as ArrayBuffer);reader.onerror=()=>reject(reader.error);reader.readAsArrayBuffer(v);});form.set(k,new WebFile([Buffer.from(bytes)],v.name,{type:v.type}));}}body=form;headers.delete('Content-Type');}
  calls.push({path:url.pathname+url.search,body:typeof body==='string'?JSON.parse(body):body});const req=new Request(url,{method,headers,body:body||undefined}),handler=routeHandlers[url.pathname]?.[method],response=handler?await handler(req as any):new Response('Not found',{status:404});const set=response.headers.get('set-cookie');if(set){const next=set.split(';')[0],name=next.split('=')[0],previous=f.getCookie().split(';').map((s:string)=>s.trim()).filter((s:string)=>!s.startsWith(name+'='));if(!set.includes('Max-Age=0'))previous.push(next);f.setCookie(previous.join('; '));}if(init.signal?.aborted)throw new DOMException('Aborted','AbortError');return response;
 });return {...f,calls,DOMFile};
}
