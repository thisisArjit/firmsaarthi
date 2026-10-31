'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {workspaceFetch} from '@/lib/workspace-sync';
import type {Row} from '@/lib/domain';
import {expiry} from '@/app/subscription/access';
import SortableTable from '@/app/sortable-table';
const statusName:Record<string,string>={administrator:'Administrator',exempt:'Complimentary',paid:'Paid',trial:'Trial',expired:'Expired',unassigned:'No workspace'};
export default function AdminUsers(){
  const [state,setState]=useState<Row|null>(null),[draft,setDraft]=useState(''),[search,setSearch]=useState(''),[account,setAccount]=useState('all'),[offset,setOffset]=useState(0),[refresh,setRefresh]=useState(0),[busy,setBusy]=useState(true),[error,setError]=useState('');
  const generation=useRef(0);
  useEffect(()=>{const current=++generation.current,controller=new AbortController();setBusy(true);setError('');setState(null);
    workspaceFetch('/api/billing?'+new URLSearchParams({view:'users',q:search,offset:String(offset),account}),{signal:controller.signal}).then(async r=>{const data=await r.json() as Row;if(!r.ok)throw new Error(r.status===401?'Sign in with the FirmSaarthi administrator account.':r.status===403?'Only the FirmSaarthi platform administrator can view users and plans.':data.error||'Unable to load users.');if(current===generation.current)setState(data);}).catch(e=>{if(!controller.signal.aborted&&current===generation.current)setError(e.message);}).finally(()=>{if(current===generation.current)setBusy(false);});
    return()=>{controller.abort();generation.current++;};
  },[search,offset,account,refresh]);
  function submit(e:FormEvent){e.preventDefault();setOffset(0);setSearch(draft.trim());setRefresh(v=>v+1);}
  return <main className="subscription-page"><div className="page-heading"><div><h1>Users &amp; plans</h1><p className="help">FirmSaarthi platform administrator · Read-only account directory</p></div><div className="inline"><a className="small" href="/subscription/admin">Customer access</a><a className="small" href="/manage-plan">Manage plan</a></div></div>
    <section className="card"><form className="inline" onSubmit={submit}><label className="field"><span>Search email or business</span><input maxLength={100} value={draft} onChange={e=>setDraft(e.target.value)}/></label><label className="field"><span>Account status</span><select value={account} onChange={e=>{setAccount(e.target.value);setOffset(0);}}><option value="all">All accounts</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select></label><button className="small" disabled={busy}>Search / refresh</button></form>
    <p className="help">Includes owners and team members. Plans and expiry are shared by a workspace; a disabled login stays disabled. Dates use India Standard Time (IST).</p>
    {busy&&<p role="status">Loading users…</p>}{error&&<p className="alert error" role="alert">{error} <a href="/">Sign in</a></p>}
    {state&&<><p role="status">{state.total} {state.total===1?'account':'accounts'}{state.users.length?` · Showing ${state.offset+1}–${state.offset+state.users.length}`:''}</p>
    <div className="table-scroll admin-users-table"><SortableTable><thead><tr><th>Email / account</th><th>Business / role</th><th>Current plan</th><th>Access</th><th>Plan expiry (IST)</th></tr></thead><tbody>{state.users.map((u:Row)=><tr key={u.userId}><td><strong>{u.email}</strong><br/><small>{u.disabled?'Disabled':'Enabled'}</small></td><td>{u.business||'No workspace'}<br/><small>{u.role==='OWNER'?'Owner':u.role==='DISPATCHER'?'Dispatcher':u.role==='MEMBER'?'Commercial member':u.role||'Not assigned'}</small></td><td>{u.plan}{u.startsAt&&u.startsAt>state.asOf&&<small><br/>Paid period starts {expiry(u.startsAt)} IST</small>}</td><td>{statusName[u.status]||'Unavailable'}</td><td>{u.expiresAt?expiry(u.expiresAt):['administrator','exempt'].includes(u.status)?'No expiry':'Not applicable'}</td></tr>)}</tbody></SortableTable></div>
    {!state.users.length&&<p>No matching users.</p>}<nav className="inline" aria-label="User pages"><button className="small" disabled={busy||offset===0} onClick={()=>setOffset(Math.max(0,offset-state.limit))}>Previous</button><button className="small" disabled={busy||state.next===null} onClick={()=>setOffset(state.next)}>Next</button></nav><p className="help">Updated {expiry(state.asOf)} IST. This page does not change plans, passwords or business records.</p></>}
    </section></main>;
}
