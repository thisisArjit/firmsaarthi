import type {SupplierDraft} from './supplier-types';
type Availability={status:string;availableUntil:string};
export function supplierAvailability(truck:Availability,at=Date.now()):'available'|'expired'|'busy'|'unlisted'|'unconfirmed'{
  if(truck.status==='inactive')return 'unlisted';
  if(truck.status==='busy')return 'busy';
  if(truck.status!=='available'||!/^\d{4}-\d{2}-\d{2}$/.test(truck.availableUntil))return 'unconfirmed';
  const end=Date.parse(truck.availableUntil+'T18:29:59.999Z');
  if(!Number.isFinite(end)||new Date(end).toISOString().slice(0,10)!==truck.availableUntil)return 'unconfirmed';
  return end>=at?'available':'expired';
}
export function supplierAvailabilityLabel(truck:Availability,at=Date.now()){
  return {available:'Available (self-reported)',expired:'Availability expired',busy:'Busy',unlisted:'Not advertised',unconfirmed:'Availability not confirmed'}[supplierAvailability(truck,at)];
}
// Saved-data guidance only. Publication authorization, field validation and
// actual expiry filtering remain authoritative on the server.
export function supplierReadiness(draft:SupplierDraft,at=Date.now()){
  const profileReady=['name','kind','city','contact','phone','email'].every(k=>typeof draft.profile[k as keyof typeof draft.profile]==='string'&&draft.profile[k as keyof typeof draft.profile].trim().length>0);
  const advertised=draft.trucks.filter(t=>t.status==='available'||t.status==='busy').length;
  const counts={available:0,expired:0,busy:0,unlisted:0,unconfirmed:0};for(const t of draft.trucks)++counts[supplierAvailability(t,at)];
  const routeReady=draft.routes.length>0,ready=profileReady&&advertised>0&&routeReady;
  return {profileReady,truckReady:advertised>0,routeReady,ready,counts,nextTab:!profileReady?3:!advertised?1:!routeReady?2:3};
}
