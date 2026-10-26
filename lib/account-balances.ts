import type { Row } from './domain';
export const ageingKeys=['notDue','days30','days60','days90','daysMore','undated'] as const;
export function balanceReport(rows:Row[],today:string){
  const groups=new Map<string,Row>();
  const documents:Row[]=rows.map(r=>{
    const key=r.party_id?`party:${r.party_id}`:`unlinked:${r.label}`,remaining=Math.max(0,r.cost-r.paid),excess=Math.max(0,r.paid-r.cost),days=r.due_date?Math.floor((Date.parse(today)-Date.parse(r.due_date))/86400000):null,bucket=days===null?'undated':days<=0?'notDue':days<=30?'days30':days<=60?'days60':days<=90?'days90':'daysMore';
    const g=groups.get(key)||{key,partyId:r.party_id||null,name:r.party_name||r.label||'Name not recorded',code:r.party_code||'',cost:0,paid:0,remaining:0,excess:0,count:0,...Object.fromEntries(ageingKeys.map(k=>[k,0]))};g.cost+=r.cost;g.paid+=r.paid;g.remaining+=remaining;g.excess+=excess;g.count++;g[bucket]+=remaining;groups.set(key,g);return {...r,key,remaining,excess,bucket};
  });
  return {asOf:today,documents,groups:[...groups.values()].sort((a,b)=>a.name.localeCompare(b.name)),totals:{cost:documents.reduce((n,r)=>n+r.cost,0),paid:documents.reduce((n,r)=>n+r.paid,0),remaining:documents.reduce((n,r)=>n+r.remaining,0),excess:documents.reduce((n,r)=>n+r.excess,0)}};
}
