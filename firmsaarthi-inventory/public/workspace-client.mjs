const key='firmsaarthi.inventory.workspace-intent.v1';
function validIntent(p){return p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).length===2&&typeof p.name==='string'&&p.name.trim()===p.name&&p.name.length>0&&p.name.length<=100&&typeof p.requestId==='string'&&/^[a-f0-9-]{36}$/.test(p.requestId);}
export class WorkspaceClient{
 constructor(fetcher=(...args)=>fetch(...args),{storage=null}={}){this.fetcher=fetcher;this.storage=storage;this.context=null;this.state=null;this.pending=null;this.busy=false;this.ambiguous=false;this.recoveryLoaded=false;}
 clear(){if(this.storage)this.storage.removeItem(key);}
 async request(path,body){
  let response,data;try{response=await this.fetcher(path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json','X-Inventory-Onboarding-Context':this.context}:{},...(body?{body:JSON.stringify(body)}:{})});data=await response.json();}catch{throw Object.assign(Error('Connection interrupted. Retry the same workspace request to check its result.'),{ambiguous:true});}
  if(!response.ok)throw Object.assign(Error(data.error||'Inventory request failed.'),{status:response.status,ambiguous:response.status>=500});return data;
 }
 async load(){
  try{
   const state=await this.request('/api/onboarding');let scope;try{scope=JSON.parse(state.context);}catch{}
   if(!['new','existing'].includes(state.state)||!Array.isArray(scope)||scope.length!==2||scope.some(s=>typeof s!=='string'||!s||s.length>200)||state.state==='existing'&&(!state.workspace||!['owner','operator','viewer'].includes(state.role)))throw Error('Inventory identity is unavailable. Reload after signing in.');
   if(this.context&&state.context!==this.context)throw Object.assign(Error('Your Inventory account changed. Reload before continuing.'),{identityChanged:true});
   this.context=state.context;
   if(this.storage&&!this.recoveryLoaded){
    const raw=this.storage.getItem(key);if(raw){let saved;try{saved=JSON.parse(raw);}catch{throw Error('Workspace recovery is unreadable. Check your existing workspace before trying again.');}
     if(saved.context!==this.context)this.clear();else{if(saved.version!==1||!validIntent(saved.intent)||Object.keys(saved).some(k=>!['version','context','intent'].includes(k)))throw Error('Workspace recovery is invalid. Check your existing workspace before trying again.');this.pending=Object.freeze({...saved.intent});this.ambiguous=true;}
    }this.recoveryLoaded=true;
   }
   this.state=state;return state;
  }catch(error){if(error.identityChanged||[401,403].includes(error.status)){this.pending=null;this.state=null;try{this.clear();}catch{}}throw error;}
 }
 review(name){if(this.busy||this.pending)throw Error('Finish the current workspace request first.');if(this.state?.state!=='new')throw Error('Open your existing Inventory workspace.');name=String(name||'').trim();if(!name||name.length>100)throw Error('Enter a workspace name of up to 100 characters.');this.pending=Object.freeze({name,requestId:crypto.randomUUID()});this.ambiguous=false;return this.pending;}
 cancel(){if(this.busy||this.ambiguous)throw Error('Check the pending workspace request before changing it.');this.clear();this.pending=null;}
 async confirm(){
  if(this.busy)throw Error('A workspace request is already running.');if(!this.pending)throw Error('Review a workspace name first.');this.busy=true;
  try{
   await this.load();if(!this.pending)throw Error('Review a workspace name first.');
   if(this.storage)try{this.storage.setItem(key,JSON.stringify({version:1,context:this.context,intent:this.pending}));}catch{throw Object.assign(Error(this.ambiguous?'Workspace recovery is unavailable. Keep this request and retry later.':'Workspace recovery could not be saved. Nothing was submitted.'),{ambiguous:this.ambiguous});}
   const result=await this.request('/api/workspaces',this.pending);
   if(!result.workspace||result.role!=='owner')throw Object.assign(Error('Workspace result is uncertain. Retry the same request.'),{ambiguous:true});
   try{this.clear();}catch{throw Object.assign(Error('Workspace created but recovery cleanup failed. Retry the same request.'),{ambiguous:true});}
   this.pending=null;this.ambiguous=false;this.state={state:'existing',context:this.context,workspace:result.workspace,role:result.role};return result;
  }catch(error){this.ambiguous=!!error.ambiguous;if(error.identityChanged||[401,403].includes(error.status)){this.pending=null;this.state=null;try{this.clear();}catch{}}throw error;}finally{this.busy=false;}
 }
}
