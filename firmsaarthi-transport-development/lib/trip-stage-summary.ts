import type {Row} from './domain';
import {parseStageEvidencePolicy,type EvidenceStage} from './trip-stage-evidence';

export type StageProofFlag={stage:string;allocation_id:string|null;accepted:number};
export type PhysicalNextAction={kind:'placement'|'loading'|'dispatch'|'arrival'|'delivery';allocationId:string|null;label:string;blocked:boolean;reason:string|null};

/** Read projection only, from scoped server rows. Proof identifiers/metadata are never returned. */
export function tripStageSummary(trip:Row,allocations:readonly Row[],events:readonly Row[],proofs:readonly StageProofFlag[]){
  const source=JSON.parse(trip.creation_payload);
  if(!source.stagePolicyRequest&&!source.stagePolicySnapshot)return undefined;
  if(source.stagePolicyRequest?.contract!=='workspace_stage_v1'||!source.stagePolicySnapshot||!Number.isSafeInteger(source.stagePolicySnapshot.version)||source.stagePolicySnapshot.version<1||source.stagePolicyRequest.version!==source.stagePolicySnapshot.version)throw new Error('Reload the saved stage requirements.');
  const policy=parseStageEvidencePolicy(source.stagePolicySnapshot.policy),ids=new Set<string>();
  for(const a of allocations){if(typeof a.id!=='string'||!a.id||ids.has(a.id))throw new Error('Reload the trip allocations.');ids.add(a.id);}
  const activeAllocations=allocations.filter(a=>a.active===1),terminal=['closed','cancelled'].includes(trip.status);
  if(!terminal&&!activeAllocations.length)throw new Error('Reload the active trip allocations.');
  const corrected=new Set(events.filter(e=>e.kind==='correction').map(e=>e.target_event_id)),active=events.filter(e=>e.kind!=='correction'&&!corrected.has(e.id));
  for(const e of events)if(e.org_id!==trip.org_id||e.trip_id!==trip.id)throw new Error('Reload scoped trip history.');
  const slots=new Set<string>();
  for(const p of proofs){const key=p.stage+':'+(p.allocation_id||'');if(!['placement','loading','arrival'].includes(p.stage)||slots.has(key)||![0,1].includes(p.accepted)||(p.stage==='placement'?p.allocation_id!==null:!p.allocation_id||!ids.has(p.allocation_id)))throw new Error('Reload scoped stage readiness.');slots.add(key);}
  const event=(kind:string,allocationId:string|null)=>{const rows=active.filter(e=>e.kind===kind&&e.allocation_id===allocationId);if(rows.length>1)throw new Error('Reload unambiguous physical progress.');return rows[0]||null;};
  const slot=(stage:EvidenceStage,allocationId:string|null)=>{const e=event(stage,allocationId),fileRequired=policy[stage]==='accepted_file';return Object.freeze({recorded:!!e,eventId:e?.id||null,actualAt:e?.event_at||null,recordedAt:e?.recorded_at||null,fileRequired,fileAccepted:fileRequired&&proofs.some(p=>p.stage===stage&&p.allocation_id===allocationId&&p.accepted===1)});};
  const placement=slot('placement',null),items=allocations.map(a=>Object.freeze({allocationId:a.id,loading:slot('loading',a.id),arrival:slot('arrival',a.id),deliveryRecorded:!!event('delivery',a.id)})),nextActions:PhysicalNextAction[]=[];
  const action=(kind:PhysicalNextAction['kind'],allocationId:string|null,state?:ReturnType<typeof slot>)=>{const blocked=!!state?.fileRequired&&!state.fileAccepted;nextActions.push(Object.freeze({kind,allocationId,label:{placement:'Record placement',loading:'Record loading',dispatch:'Record departure',arrival:'Record arrival',delivery:'Record delivery'}[kind],blocked,reason:blocked?`Owner-accepted ${kind} file required.`:null}));};
  if(!terminal){
    if(trip.status==='planned'){
      if(!placement.recorded)action('placement',null,placement);
      else{for(const a of activeAllocations){const item=items.find(i=>i.allocationId===a.id)!;if(!item.loading.recorded)action('loading',a.id,item.loading);}if(!nextActions.length)action('dispatch',null);}
    }else if(trip.status==='dispatched'){
      for(const a of activeAllocations){const item=items.find(i=>i.allocationId===a.id)!;if(!item.arrival.recorded)action('arrival',a.id,item.arrival);else if(!item.deliveryRecorded)action('delivery',a.id);}
    }else throw new Error('Reload the current trip phase.');
  }
  return Object.freeze({sourceVersion:source.stagePolicySnapshot.version,policy,placement,items:Object.freeze(items),nextActions:Object.freeze(nextActions),provenance:'manual' as const});
}
