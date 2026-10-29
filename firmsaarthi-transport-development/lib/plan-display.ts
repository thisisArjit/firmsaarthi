import type {Row} from './domain';
export function currentPlanName(s:Row):string{
  if(s.status==='trial')return 'Free trial';
  if(s.status==='exempt'&&!s.currentPlan?.tier)return 'Complimentary access';
  if(s.status==='administrator')return 'Administrator access';
  if(!['paid','exempt'].includes(s.status))return 'No active plan';
  const plan=s.currentPlan||s.payments?.find((p:Row)=>p.period_end===s.subscription.paid_until),tier=plan?.tier||s.subscription.plan_tier;
  const name=tier==='team'?'Team':tier==='individual'?'Individual':'';
  return name?name+(plan?.interval==='yearly'?' Annual':plan?.interval==='monthly'?' Monthly':' plan'):'Paid access';
}
export function planStatusName(status:string):string{return ({trial:'Trial',paid:'Active',exempt:'Complimentary',administrator:'Administrator',expired:'Expired'} as Record<string,string>)[status]||'Unavailable';}
