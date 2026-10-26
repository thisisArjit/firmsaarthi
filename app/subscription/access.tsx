'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { workspaceFetch, useWorkspaceRevision } from '@/lib/workspace-sync';
import type { Row } from '@/lib/domain';
import { billingContactHref } from '@/lib/billing-contact';
const BillingContext=createContext<Row|null>(null);
export const price=(amount:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:0,maximumFractionDigits:2}).format(amount/100);
export const expiry=(value:string)=>new Date(value).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'});
export function SubscriptionNotice({state:s}:{state:Row}){
  if(s.status==='trial'||s.status==='expired')return <aside className="subscription-banner" aria-label="Subscription status"><span>{s.status==='trial'?`${s.daysRemaining} ${s.daysRemaining===1?'day':'days'} left in your free trial. Unlimited usage until ${expiry(s.subscription.trial_ends_at)}.`:'Your trial or subscription has ended. Choose a plan to continue.'}{!s.owner&&' Your workspace owner manages the subscription.'}</span><a className="small" href="/subscription">{s.owner?'Upgrade your plan':'View plans'}</a></aside>;
  return <nav className="subscription-tools" aria-label="Subscription"><span>{s.status==='paid'?`Plan active until ${expiry(s.subscription.paid_until)}`:s.status==='exempt'?`Complimentary access${s.subscription.exempt_until?' until '+expiry(s.subscription.exempt_until):''}`:''}</span><a href="/subscription">Subscription</a>{s.admin&&<a href="/subscription/admin">Customer subscriptions</a>}</nav>;
}
export function SubscriptionBanner(){const state=useContext(BillingContext);return state?<SubscriptionNotice state={state}/>:null;}
export function SubscriptionDetails({state:s,onChange}:{state:Row;onChange:()=>void}){
  const contactHref=billingContactHref(s.plan.contact||'');
  const [selection,setSelection]=useState(s.subscription.requested_at?`${s.subscription.requested_tier}-${s.subscription.requested_interval}`:'');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const plans=[
    {id:'individual-monthly',tier:'individual',interval:'monthly',name:'Individual Monthly',amount:s.plan.monthly_amount,logins:'One active login',period:'month'},
    {id:'individual-yearly',tier:'individual',interval:'yearly',name:'Individual Annual',amount:s.plan.yearly_amount,logins:'One active login',period:'year',saving:s.plan.monthly_amount*12-s.plan.yearly_amount},
    {id:'team-monthly',tier:'team',interval:'monthly',name:'Team Monthly',amount:s.plan.team_monthly_amount,logins:'Multiple team logins',period:'month'},
    {id:'team-yearly',tier:'team',interval:'yearly',name:'Team Annual',amount:s.plan.team_yearly_amount,logins:'Multiple team logins',period:'year',saving:s.plan.team_monthly_amount*12-s.plan.team_yearly_amount},
  ];
  const paidLive=!!s.subscription.paid_until&&Date.parse(s.subscription.paid_until)>Date.parse(s.asOf||new Date().toISOString());
  const restricted=(tier:string)=>paidLive&&s.subscription.plan_tier!==tier;
  const canRequest=s.owner&&['trial','expired','paid'].includes(s.status);
  const selected=plans.find(p=>p.id===selection),current=s.payments?.find((p:Row)=>p.period_end===s.subscription.paid_until);
  async function request(){
    if(!selected||!canRequest||restricted(selected.tier))return;
    setBusy(true);setError('');setNotice('');
    try{const r=await workspaceFetch('/api/billing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'request',data:{tier:selected.tier,interval:selected.interval}})}),v=await r.json() as Row;if(!r.ok)throw new Error(v.error);setNotice(`${selected.name} activation requested. No payment has been collected.`);onChange();}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <>
    <section className="card subscription-summary" aria-labelledby="access-heading"><h1 id="access-heading">{s.status==='expired'?'Choose a plan to continue':'Plans & subscription'}</h1><p className="help">{s.business}</p>
      <p>{s.status==='trial'?`Your free trial has ${s.daysRemaining} days remaining. Unlimited usage until ${expiry(s.subscription.trial_ends_at)}.`:s.status==='paid'?`${s.subscription.plan_tier==='team'?'Team':s.subscription.plan_tier==='individual'?'Individual':'Previous plan'} access is active until ${expiry(s.subscription.paid_until)}.`:s.status==='exempt'?`Complimentary access${s.subscription.exempt_until?' until '+expiry(s.subscription.exempt_until):''}. No paid plan is needed while this access is active.`:s.status==='administrator'?'Your administrator workspace has access. No paid plan is needed.':'Your trial or subscription has ended. Your records are retained.'}</p>
      {paidLive&&<p className="help">Renew the same plan type below. Changing between Individual and Team is available after the current paid period ends.</p>}
      {!s.owner&&<p className="help">Only your workspace owner can request a plan or arrange payment.</p>}
      {s.subscription.requested_at&&<p className="help" role="status">{s.subscription.requested_tier==='team'?'Team':'Individual'} {s.subscription.requested_interval==='yearly'?'Annual':'Monthly'} activation requested on {expiry(s.subscription.requested_at)}. Awaiting confirmation.</p>}
    </section>
    <section className="subscription-plans" aria-labelledby="plans-heading"><div className="plans-heading"><h2 id="plans-heading">Choose your plan</h2><p>All four plans include unlimited usage of available features. Choose one login or a shared team workspace.</p></div>
      <div className="pricing-grid">{plans.map(p=>{
        const blocked=restricted(p.tier),isCurrent=s.status==='paid'&&current?.tier===p.tier&&current?.interval===p.interval;
        return <article className={`plan-card${selection===p.id?' selected':''}`} key={p.id} aria-labelledby={p.id+'-heading'}>
          <div className="plan-label">{isCurrent?'Current plan':p.interval==='yearly'&&p.saving&&p.saving>0?`Save ${price(p.saving)} a year`:'Flexible monthly access'}</div>
          <h3 id={p.id+'-heading'}>{p.name}</h3><p className="help">{p.logins}</p>
          <p className="plan-amount">{price(p.amount)}<span> / {p.period}</span></p><p className="help">{p.interval==='yearly'?'Paid once for 12 months':'Paid for one calendar month'}</p>
          <ul><li>Unlimited usage</li><li>{p.tier==='team'?'Shared workspace with team roles':'Your individual workspace'}</li><li>Available transport & billing features</li></ul>
          <button className={selection===p.id?'primary':'small'} aria-pressed={selection===p.id} disabled={busy||!canRequest||blocked} onClick={()=>{setSelection(p.id);setError('');setNotice('');document.getElementById('activation-heading')?.scrollIntoView({block:'start'});}}>{selection===p.id?'Selected':isCurrent?'Renew this plan':'Choose '+p.name}</button>
          {blocked&&canRequest&&<p className="help">Available after your paid period ends.</p>}
        </article>;
      })}</div>
      <p className="help plans-footnote">Unlimited usage follows your account permissions and technical/security safeguards. Provider-dependent features require their own setup.</p>
    </section>
    {canRequest&&<section className="card plan-activation" aria-labelledby="activation-heading"><h2 id="activation-heading">Activate your plan</h2>
      {selected?<p><strong>{selected.name}</strong> · {price(selected.amount)} / {selected.period}</p>:<p>Select a plan above to request activation.</p>}
      <p className="help">No automatic charges. Access is activated after your payment is confirmed.</p>
      {s.plan.contact&&<p>For payment and activation, contact {contactHref?<a className="text-link" href={contactHref}>{s.plan.contact}</a>:s.plan.contact}.</p>}
      <button className="primary" disabled={busy||!selected||restricted(selected.tier)} onClick={request}>{busy?'Saving…':'Request activation'}</button>
      {notice&&<p role="status" className="alert success">{notice}</p>}{error&&<p role="alert" className="alert error">{error}</p>}
    </section>}
    {s.owner&&<p className="help"><a href="/api/tms?download=backup">Export your workspace records</a> · <a href="/account">My account</a></p>}
    {s.payments?.length>0&&<details className="optional-fields"><summary>Activation history</summary>{s.payments.map((p:Row)=><p className="help" key={p.created_at+p.reference}>{p.tier==='team'?'Team':p.tier==='individual'?'Individual':'Previous plan'} · {p.interval==='yearly'?'Annual':'Monthly'} · {price(p.amount)} · {p.reference} · {expiry(p.period_start)} to {expiry(p.period_end)} · manually confirmed</p>)}</details>}
  </>;
}
export default function SubscriptionAccess({children,details=false}:{children?:ReactNode;details?:boolean}){
  const revision=useWorkspaceRevision(),[state,setState]=useState<Row|null>(null),[error,setError]=useState('');
  async function load(){try{const r=await workspaceFetch('/api/billing');if(r.status===401){window.location.replace('/');return;}const s=await r.json() as Row;if(!r.ok)throw new Error(s.error);setState(s);setError('');}catch(e){setError((e as Error).message);}}
  useEffect(()=>{load();},[revision]);
  async function logout(){await workspaceFetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});window.location.replace('/');}
  if(!state)return <main className="boot"><h1>Logistrace</h1><p>{error||'Loading your workspace…'}</p>{error&&<button className="small" onClick={load}>Try again</button>}</main>;
  if(details||!state.allowed)return <main className="subscription-page"><div className="page-heading"><strong>Logistrace</strong><div className="inline">{state.allowed&&<a className="small" href="/">Back to workspace</a>}{state.admin&&<a href="/subscription/admin">Customer subscriptions</a>}<button className="small" onClick={logout}>Sign out</button></div></div>{error&&<p className="alert error" role="alert">{error}</p>}<SubscriptionDetails state={state} onChange={load}/><button className="small" onClick={load}>Refresh subscription</button></main>;
  return <BillingContext.Provider value={state}>{children}</BillingContext.Provider>;
}
