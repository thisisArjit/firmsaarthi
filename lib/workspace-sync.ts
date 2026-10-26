'use client';
import { useSyncExternalStore } from 'react';

let revision=0;
const listeners=new Set<()=>void>();
let channel:BroadcastChannel|null=null,timer:ReturnType<typeof setInterval>|null=null;
function emit(){revision++;for(const listener of listeners)listener();}
function visibleRefresh(){if(document.visibilityState==='visible')emit();}
function subscribe(listener:()=>void){
  listeners.add(listener);
  if(listeners.size===1&&typeof window!=='undefined'){
    if(typeof BroadcastChannel!=='undefined'){try{channel=new BroadcastChannel('logistrace-data');channel.onmessage=event=>{if(event.data==='changed')emit();};}catch{/* Focus/interval refresh still works in restricted browser contexts. */}}
    window.addEventListener('focus',visibleRefresh);window.addEventListener('online',visibleRefresh);document.addEventListener('visibilitychange',visibleRefresh);
    // Cross-device changes are checked while the workspace is visible.
    timer=setInterval(visibleRefresh,30000);
  }
  return()=>{listeners.delete(listener);if(!listeners.size&&typeof window!=='undefined'){channel?.close();channel=null;if(timer)clearInterval(timer);timer=null;window.removeEventListener('focus',visibleRefresh);window.removeEventListener('online',visibleRefresh);document.removeEventListener('visibilitychange',visibleRefresh);}};
}
export function useWorkspaceRevision(){return useSyncExternalStore(subscribe,()=>revision,()=>0);}
export function workspaceChanged(){emit();try{if(channel)channel.postMessage('changed');else if(typeof window!=='undefined'&&typeof BroadcastChannel!=='undefined'){const notification=new BroadcastChannel('logistrace-data');notification.postMessage('changed');notification.close();}}catch{/* Do not turn a successful save into an error if cross-tab messaging is unavailable. */}}

// All business writes use one invalidation path, including imports/uploads.
// Messages contain no business records. Each tab refetches using its own session.
export async function workspaceFetch(input:RequestInfo|URL,init?:RequestInit):Promise<Response>{
  const url=typeof input==='string'?input:input instanceof URL?input.pathname:input.url;
  const business=url.startsWith('/api/tms')||url.startsWith('/api/billing')||url.startsWith('/api/auth')||/^https?:\/\/[^/]+\/api\/(?:tms|auth|billing)(?:[/?]|$)/.test(url);
  const method=(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
  let version=revision,response=await fetch(input,init);
  if(business&&method!=='GET'&&response.ok)workspaceChanged();
  // A read started before a successful write must not overwrite newer state.
  for(let retry=0;business&&method==='GET'&&response.ok&&version!==revision&&retry<2;retry++){await response.body?.cancel();version=revision;response=await fetch(input,init);}
  return response;
}
