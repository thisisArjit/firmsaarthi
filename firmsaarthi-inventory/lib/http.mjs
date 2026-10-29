import {D1Stock} from './d1-stock.mjs';
import {inventoryMember} from './identity.mjs';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'};
const result=(value,status=200,extra={})=>Response.json(value,{status,headers:{...headers,...extra}});
class HttpError extends Error{constructor(message,status){super(message);this.status=status;}}
async function body(request){
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')throw new HttpError('Use application/json.',415);
 if(Number(request.headers.get('content-length'))>16384)throw new HttpError('Request is too large.',413);
 const reader=request.body?.getReader();let size=0,text='';const decoder=new TextDecoder();
 if(reader)try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>16384){await reader.cancel();throw new HttpError('Request is too large.',413);}text+=decoder.decode(r.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
 let value;try{value=JSON.parse(text);}catch{throw new HttpError('Enter valid JSON.',400);}
 if(!value||typeof value!=='object'||Array.isArray(value))throw new HttpError('Expected an object.',400);
 if(['orgId','userId','org_id','user_id','role','email','actor'].some(key=>Object.hasOwn(value,key)))throw new HttpError('Identity fields are not accepted.',400);
 return value;
}
export async function inventoryHttp(request,{DB,APP_ORIGIN,SITE_ID,getIdentity}){
 try{
  let configured;try{configured=new URL(APP_ORIGIN);}catch{throw new HttpError('Inventory is not configured.',503);}
  if(configured.protocol!=='https:'||configured.origin!==APP_ORIGIN||typeof SITE_ID!=='string'||!SITE_ID||typeof getIdentity!=='function')throw new HttpError('Inventory is not configured.',503);
  const url=new URL(request.url);if(url.origin!==APP_ORIGIN||request.headers.get('sec-fetch-site')==='cross-site')throw new HttpError('Request origin is not allowed.',403);
  if(!['GET','POST'].includes(request.method))throw new HttpError('Method not allowed.',405);
  if(request.method==='POST'&&request.headers.get('origin')!==APP_ORIGIN)throw new HttpError('Request origin is not allowed.',403);
  if(!DB)throw new HttpError('Inventory is unavailable.',503);
  const db=DB.withSession?DB.withSession('first-primary'):DB;
  const verified=await getIdentity();if(!verified)throw new HttpError('Sign in to Inventory.',401);
  const identity=await inventoryMember(db,verified,SITE_ID);if(!identity)throw new HttpError('Inventory workspace access required.',403);
  // Optional caller precondition is never authority. It binds an already-open UI
  // draft to the currently verified tenant/actor and closes account-switch races.
  const context=request.headers.get('x-inventory-context');if(request.method==='POST'&&context!==null&&context!==JSON.stringify([identity.orgId,identity.userId]))throw new HttpError('Your workspace changed. Reload before continuing.',403);
  const stock=new D1Stock(db,identity);
  if(request.method==='GET'){
   if(url.pathname==='/api/session')return result({role:identity.role,workspace:identity.orgId,actor:identity.userId});
   if(url.pathname==='/api/stock')return result({...await stock.state(),workspace:identity.orgId,actor:identity.userId});
   if(url.pathname==='/api/history')return result(await stock.history(url.searchParams.get('item')||'',url.searchParams.get('warehouse')||'',{after:Number(url.searchParams.get('after')||0),limit:Number(url.searchParams.get('limit')||100)}));
  }else{
   if(!['/api/items','/api/warehouses','/api/movements'].includes(url.pathname))throw new HttpError('Not found.',404);
   const value=await body(request);
   if(url.pathname==='/api/items')return result(await stock.item(value),201);
   if(url.pathname==='/api/warehouses')return result(await stock.warehouse(value),201);
   if(url.pathname==='/api/movements'){const row=await stock.post(value);return result(row,row.replayed?200:201);}
  }
  throw new HttpError('Not found.',404);
 }catch(error){
  if(error instanceof HttpError)return result({error:error.message},error.status);
  const message=String(error?.message||'');
  if(/Owner permission|Stock permission|Workspace access/.test(message))return result({error:'This action is not permitted.'},403);
  if(/UNIQUE constraint/.test(message))return result({error:'That code or reference is already in use.'},409);
  for(const [pattern,safe] of [[/Stock changed/,'Stock changed. Review the latest balance before adjusting.'],[/Insufficient stock/,'Insufficient stock.'],[/already used/,'Request ID already used for another movement.'],[/Invalid reversal source/,'Invalid reversal source.']])if(pattern.test(message))return result({error:safe},409);
  if(/^(Invalid |Enter a |Choose a |Quantity |Stock exceeds|Active item|Movement unavailable)/.test(message))return result({error:message},400);
  return result({error:'Inventory request failed. Please try again.'},500);
 }
}
