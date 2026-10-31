'use client';
import BrandMark from './brand-mark';
import SortableTable from '@/app/sortable-table';
import ConsignmentTimeline from './consignment-timeline';
import { SubscriptionBanner, ManagePlan } from './subscription/access';
import { useState, type FormEvent } from 'react';
import { Truck, LogOut, RefreshCw } from 'lucide-react';
import type { Row } from '@/lib/domain';
import TripsPanel from './trips-panel';
import AccountAccess from './account/access';
import ProductUpdates from './product-updates';

export default function DispatchDesk({state,year,setYear,refresh,logout,refreshError}:{refreshError:string;state:Row;year:string;setYear:(v:string)=>void;refresh:()=>Promise<void>;logout:()=>Promise<void>}){
  const [page,setPage]=useState('bookings'),[query,setQuery]=useState(''),[passwords,setPasswords]=useState({current:'',next:'',confirm:''}),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
  const records=state.consignments.filter((r:Row)=>[r.cn,r.company,r.truck,r.origin,r.destination].some(v=>String(v).toLowerCase().includes(query.toLowerCase())));
  async function changePassword(e:FormEvent){e.preventDefault();setError('');setNotice('');if(passwords.next!==passwords.confirm){setError('New passwords do not match.');return;}setBusy(true);try{const r=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'password.change',currentPassword:passwords.current,password:passwords.next})}),v=await r.json() as Row;if(!r.ok)throw new Error(v.error);setPasswords({current:'',next:'',confirm:''});setNotice('Password changed. Other sessions have been signed out.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <div className="dispatch-shell"><header className="dispatch-header"><div className="inline"><BrandMark size={32}/><strong>FirmSaarthi</strong><span className="badge neutral">Dispatcher</span></div><div className="inline"><button className="icon" aria-label="Refresh records" onClick={()=>refresh()}><RefreshCw size={17}/></button><button className="small" onClick={logout}><LogOut size={15}/>Sign out</button></div></header><main className="dispatch-content"><SubscriptionBanner/>{refreshError&&<p className="alert error" role="alert">{refreshError}</p>}<div className="page-heading"><div><h1>{state.business.name}</h1><p className="help">Trip planning and progress · {state.user.email}</p></div><label className="field dispatch-year"><span>Financial year</span><select value={year} onChange={e=>setYear(e.target.value)}>{Array.from({length:15},(_,i)=>new Date().getFullYear()+1-i).map(y=><option key={y}>{y}-{y+1}</option>)}</select></label></div><nav className="section-tabs" aria-label="Dispatch pages">{[['bookings','Consignments'],['timeline','Timeline'],['trips','Trips'],['account','My account'],['updates',"What's new"],['plan','Manage plan']].map(([key,label])=><button key={key} className={page===key?'active':''} onClick={()=>{setPage(key);setNotice('');setError('');}}>{label}</button>)}</nav>
    {page==='bookings'&&<section className="card"><div className="card-heading"><h2>Consignments</h2><span className="badge neutral">{records.length} records</span></div><label className="field fleet-filter"><span>Search number, customer, truck or route</span><input value={query} onChange={e=>setQuery(e.target.value)}/></label><p className="help">Use Trips to plan movement and record departure, delivery or exceptions. Ask the owner to create or amend a booking.</p><div className="table-scroll"><SortableTable><thead><tr><th>Consignment / date</th><th>Customer</th><th>Truck</th><th>Route</th></tr></thead><tbody>{records.map((r:Row)=><tr key={r.id}><td><div className="cell-stack"><strong>{r.cn}</strong><small>{r.date}</small></div></td><td><span className="cell-text">{r.company}</span></td><td>{r.truck}</td><td><span className="cell-text">{r.origin} → {r.destination}</span></td></tr>)}</tbody></SortableTable></div>{!records.length&&<p className="help">No matching consignments in this year.</p>}</section>}
    {page==='timeline'&&<ConsignmentTimeline year={year}/>}{page==='plan'&&<ManagePlan/>}
    {page==='updates'&&<ProductUpdates/>}
    {page==='trips'&&<TripsPanel year={year} revision={state} onBill={()=>{}}/>}
    {page==='account'&&<section className="card"><h2>My account</h2><p className="help">Dispatcher access covers workspace trip planning and progress. Ask the owner about access changes.</p>{error&&<p className="alert error" role="alert">{error}</p>}{notice&&<p className="alert success" role="status">{notice}</p>}<AccountAccess/></section>}
    </main></div>;
}
