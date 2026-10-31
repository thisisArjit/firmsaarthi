'use client';
import { useEffect, useState } from 'react';
export type Session = {user: {id:string;email:string;name:string;googleLinked:boolean}|null;admin:boolean;googleEnabled:boolean;emailEnabled:boolean;sharedAccountEnabled?:boolean};
export function useSession() { const [session,setSession]=useState<Session|null>(null); useEffect(()=>{fetch('/api/session').then(r=>r.json() as Promise<Session>).then(setSession).catch(()=>setSession({user:null,admin:false,googleEnabled:false,emailEnabled:false}));},[]); return session; }
export async function api(path:string,body?:unknown,token?:string):Promise<any> {
  const form=body instanceof FormData;
  const res=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',headers:{...(!form&&body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body!==undefined?{body:form?body:JSON.stringify(body)}:{})});
  const data=await res.json() as any; if(!res.ok) throw Object.assign(new Error(data.error||'Something went wrong. Please try again.'),{status:res.status}); return data;
}
export function Brand() { return <a className="brand" href="/" aria-label="Sites by FirmSaarthi home"><img src="/firmsaarthi-logo.png" alt="" width="38" height="38"/><span>Sites<small>by FirmSaarthi</small></span></a>; }
export function Header() { const session=useSession(); return <header className="header wrap"><Brand/><nav aria-label="Main navigation"><a href="/#how">How it works</a><a href="/#examples">Website styles</a><a href="/#pricing">Pricing</a></nav><div className="header-actions"><a href={session?.user?'/account':'/signin'}>{session?.user?'My websites':'Sign in'}</a><a className="button small primary" href="/create">Start free <span>↗</span></a></div></header>; }
export function Footer() { return <footer className="footer wrap"><div><Brand/><p>A little more online. A lot more possibility.</p></div><div className="footer-links"><a href="mailto:firmsaarthi@gmail.com">Get in touch ↗</a><a href="/terms">Service details</a><a href="/privacy">Privacy</a><a href="https://www.firmsaarthi.com">Explore FirmSaarthi ↗</a><a href="/admin">Admin</a></div><small>© {new Date().getFullYear()} FirmSaarthi</small></footer>; }
export function Message({children,error=false}:{children:React.ReactNode;error?:boolean}) { return <div className={error?'notice error':'notice'} role={error?'alert':'status'}>{children}</div>; }
export function Empty({title,children}:{title:string;children:React.ReactNode}) { return <section className="empty"><span className="empty-icon">↗</span><h2>{title}</h2><p>{children}</p></section>; }
