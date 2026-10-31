import type { Row } from './domain';

export function vehicleRegistration(value:unknown):string {
  const registration=String(value||'').toUpperCase().replace(/[\s-]/g,'');
  if(!/^[A-Z0-9]{5,20}$/.test(registration))throw new Error('Enter a truck registration using 5–20 letters or digits.');
  return registration;
}
export function actualTime(value:unknown):string {
  const text=String(value||'');
  if(!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(text)||!Number.isFinite(Date.parse(text)))throw new Error('Enter a valid event time with timezone.');
  // Reject impossible calendar dates that JavaScript otherwise normalizes.
  const date=text.slice(0,10);if(new Date(date).toISOString().slice(0,10)!==date)throw new Error('Enter a valid event date.');
  if(Date.parse(text)>Date.now())throw new Error('Actual event time cannot be in the future.');
  return new Date(text).toISOString();
}
export function tripProgress(allocations:Row[],events:Row[]):Row {
  const corrected=new Set(events.filter(e=>e.kind==='correction').map(e=>e.target_event_id));
  const active=events.filter(e=>e.kind!=='correction'&&!corrected.has(e.id));
  const dispatch=active.find(e=>e.kind==='dispatch'),closed=active.find(e=>e.kind==='close'),cancelled=active.find(e=>e.kind==='cancel');
  const resolved=new Set(active.filter(e=>e.kind==='exception_resolve').map(e=>e.target_event_id));
  const exceptions=active.filter(e=>e.kind==='exception'&&!resolved.has(e.id));
  const items=allocations.map(a=>{const own=active.filter(e=>e.allocation_id===a.id),delivery=own.find(e=>e.kind==='delivery'),pod=own.filter(e=>['pod_accept','pod_reject'].includes(e.kind)).at(-1);return {...a,delivery:delivery||null,pod:pod||null,progress:pod?.kind==='pod_accept'?'POD accepted':delivery?'Awaiting POD':'Awaiting delivery'};});
  return {active,corrected:[...corrected],dispatch:dispatch||null,status:cancelled?'cancelled':closed?'closed':dispatch?'dispatched':'planned',items,exceptions,delivered:items.filter(a=>a.delivery).length,accepted:items.filter(a=>a.pod?.kind==='pod_accept').length,readyToClose:!!dispatch&&items.length>0&&items.every(a=>a.pod?.kind==='pod_accept')&&!exceptions.length};
}
