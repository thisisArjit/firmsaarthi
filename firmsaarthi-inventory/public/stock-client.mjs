// One reviewed intent survives an ambiguous response; retry never generates a second ID.
export class StockClient {
 constructor(fetcher=(...args)=>fetch(...args),{storage=null}={}){this.fetcher=fetcher;this.storage=storage;this.pending=null;this.busy=false;this.identity=null;this.state=null;this.recoveryLoaded=false;}
 clearRecovery(){if(this.storage)this.storage.removeItem('firmsaarthi.inventory.intent.v1');}
 restoreRecovery(){
  if(!this.storage||this.recoveryLoaded)return;
  const raw=this.storage.getItem('firmsaarthi.inventory.intent.v1');
  if(raw){
   let saved;try{saved=JSON.parse(raw);}catch{throw Error('Saved movement recovery is unreadable. Check stock history before recording another movement.');}
   if(saved.context!==this.identity){this.clearRecovery();this.recoveryLoaded=true;return;}
   const p=saved.intent,allowed=['kind','reason','requestId','itemId','warehouseId','quantity','expectedVersion','reverses'];
   if(saved.version!==1||!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!allowed.includes(k))||!['receive','issue','adjust_in','adjust_out','reverse'].includes(p.kind)||typeof p.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(p.requestId)||typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>500||
    (p.kind==='reverse'?typeof p.reverses!=='string'||!p.reverses||p.reverses.length>100:typeof p.itemId!=='string'||!p.itemId||p.itemId.length>100||typeof p.warehouseId!=='string'||!p.warehouseId||p.warehouseId.length>100||typeof p.quantity!=='string'||!/^\d{1,7}(?:\.\d{1,3})?$/.test(p.quantity)||!/[1-9]/.test(p.quantity)||p.kind.startsWith('adjust')&&(!Number.isSafeInteger(p.expectedVersion)||p.expectedVersion<0)))throw Error('Saved movement recovery is invalid. Check stock history before recording another movement.');
   this.pending=Object.freeze({...p});this.ambiguous=true;this.recovered=true;
  }
  this.recoveryLoaded=true;
 }
 async request(path,body){
  let response,data;try{response=await this.fetcher(path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json',...(this.identity?{'X-Inventory-Context':this.identity}:{})}:{},...(body?{body:JSON.stringify(body)}:{})});data=await response.json();}
  catch{throw Object.assign(Error('Connection interrupted. Retry the same request to check whether it was recorded.'),{ambiguous:true});}
  if(!response.ok)throw Object.assign(Error(data.error||'Request failed.'),{status:response.status,ambiguous:response.status>=500});return data;
 }
 async load(){
  const session=await this.request('/api/session'),state=await this.request('/api/stock');
  const identity=JSON.stringify([session.workspace,session.actor]);
  if(!session.workspace||!session.actor||state.workspace!==session.workspace||state.actor!==session.actor||this.identity&&identity!==this.identity){this.pending=null;this.state=null;try{this.clearRecovery();}catch{}throw Object.assign(Error('Your workspace changed. Reload before continuing.'),{identityChanged:true});}
  this.identity=identity;this.role=session.role;this.restoreRecovery();this.state=state;return state;
 }
 review(input){
  if(this.pending)throw Error('Finish or cancel the current review first.');
  if(this.role==='viewer'||this.role!=='owner'&&!['receive','issue'].includes(input.kind))throw Error('This action is not permitted.');
  const reason=String(input.reason||'').trim();if(!reason||reason.length>500)throw Error('Enter a reason of up to 500 characters.');
  const value={kind:input.kind,reason,requestId:crypto.randomUUID()};
  if(input.kind==='reverse'){
   if(this.role!=='owner'||!input.reverses)throw Error('Choose an original movement to reverse.');value.reverses=input.reverses;
  }else{
   if(!['receive','issue','adjust_in','adjust_out'].includes(input.kind))throw Error('Choose a movement type.');
   const item=this.state?.items.find(i=>i.id===input.itemId&&i.active),warehouse=this.state?.warehouses.find(w=>w.id===input.warehouseId&&w.active);
   if(!item||!warehouse)throw Error('Choose an active item and warehouse.');
   if(typeof input.quantity!=='string'||!/^\d{1,7}(?:\.\d{1,3})?$/.test(input.quantity)||!/[1-9]/.test(input.quantity))throw Error('Enter a positive decimal quantity without commas.');
   if(['each','box'].includes(item.unit)&&input.quantity.includes('.'))throw Error('Use whole units for this item.');
   Object.assign(value,{itemId:item.id,warehouseId:warehouse.id,quantity:input.quantity});
   if(input.kind.startsWith('adjust'))value.expectedVersion=this.state.balances.find(b=>b.item_id===item.id&&b.warehouse_id===warehouse.id)?.version||0;
  }
  this.pending=Object.freeze(value);this.ambiguous=false;return this.pending;
 }
 cancel(){if(this.busy||this.ambiguous)throw Error('Check the pending request before changing it.');this.clearRecovery();this.pending=null;}
 async confirm(){
  if(this.busy)throw Error('A request is already running.');if(!this.pending)throw Error('Review a movement first.');
  this.busy=true;try{
   // Revalidate the signed-in workspace before any draft is submitted.
   const session=await this.request('/api/session');if(JSON.stringify([session.workspace,session.actor])!==this.identity)throw Object.assign(Error('Your workspace changed. Reload before continuing.'),{identityChanged:true});
   // Persist before sending, including the original adjustment version. Storage
   // failure blocks the write rather than leaving an unrecoverable stock intent.
   if(this.storage){try{this.storage.setItem('firmsaarthi.inventory.intent.v1',JSON.stringify({version:1,context:this.identity,intent:this.pending}));}catch{throw Object.assign(Error(this.ambiguous?'Movement recovery is unavailable. Keep this request and check stock history before proceeding.':'Movement recovery could not be saved. Nothing was submitted. Enable session storage before continuing.'),{ambiguous:!!this.ambiguous});}}
   const row=await this.request('/api/movements',this.pending);
   try{this.clearRecovery();}catch{throw Object.assign(Error('Movement recorded but recovery cleanup failed. Retry this same request to confirm it.'),{ambiguous:true});}
   this.pending=null;this.ambiguous=false;this.recovered=false;return row;
  }catch(error){this.ambiguous=!!error.ambiguous;if(error.identityChanged||[401,403].includes(error.status)){this.pending=null;try{this.clearRecovery();}catch{}}throw error;}finally{this.busy=false;}
 }
}
export function formatQuantity(value){if(!Number.isSafeInteger(value))throw Error('Invalid quantity.');const n=BigInt(value),a=n<0n?-n:n;return (n<0n?'-':'')+(a/1000000n)+(a%1000000n?'.'+String(a%1000000n).padStart(6,'0').replace(/0+$/,''):'');}
