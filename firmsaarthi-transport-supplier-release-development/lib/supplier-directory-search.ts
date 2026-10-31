export type DirectoryQuery={filters:Record<string,string>;offset:number};
export type DirectoryState={items:any[];busy:boolean;error:string;hasMore:boolean;query:DirectoryQuery;checkedAt:string|null};
export const emptyDirectoryState=():DirectoryState=>({items:[],busy:false,error:'',hasMore:false,query:{filters:{},offset:0},checkedAt:null});

// A directory read is replaceable; a supplier write is not. Keep this controller
// separate from request-receipt recovery and never cancel/reissue mutations.
export function supplierDirectorySearch(publish:(state:DirectoryState)=>void,fetcher:typeof fetch=fetch){
  let state=emptyDirectoryState(),generation=0,disposed=false,request:AbortController|null=null;
  function update(next:DirectoryState){state=next;if(!disposed)publish(next);}
  async function search(filters:Record<string,string>,offset=0){
    if(disposed)return;
    const ticket=++generation;request?.abort();const current=new AbortController();request=current;
    const query={filters:{...filters},offset};
    // Old contacts must not remain actionable while a new search is unconfirmed
    // or after an authorization/network failure.
    update({items:[],busy:true,error:'',hasMore:false,query,checkedAt:null});
    try{
      const response=await fetcher('/api/supplier-portal?'+new URLSearchParams({view:'discover',...query.filters,offset:String(offset)}),{cache:'no-store',signal:current.signal});
      const body=await response.json() as {items?:any[];hasMore?:boolean;offset?:number;asOf?:string;error?:string};
      if(disposed||ticket!==generation)return;
      if(!response.ok)throw new Error(typeof body.error==='string'?body.error:'Unable to refresh suppliers. Try again.');
      if(!Array.isArray(body.items)||typeof body.hasMore!=='boolean'||body.offset!==offset||typeof body.asOf!=='string'||!Number.isFinite(Date.parse(body.asOf)))throw new Error('Unable to confirm supplier results. Try refreshing again.');
      update({items:body.items,busy:false,error:'',hasMore:body.hasMore,query,checkedAt:body.asOf});
    }catch(error){
      if(disposed||ticket!==generation)return;
      update({items:[],busy:false,error:error instanceof Error&&!(error instanceof SyntaxError)?error.message:'Unable to refresh suppliers. Check your connection and try again.',hasMore:false,query,checkedAt:null});
    }
  }
  return {search,refresh:()=>state.busy?Promise.resolve():search(state.query.filters,state.query.offset),dispose:()=>{disposed=true;++generation;request?.abort();}};
}
