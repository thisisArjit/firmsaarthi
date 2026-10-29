// Unpublished domain contract. The checklist does not yet permit any trip transition.
export const evidenceStages=['placement','loading','arrival'] as const;
export type EvidenceStage=typeof evidenceStages[number];
export type EvidenceRule='optional'|'accepted_file';
export type StageEvidencePolicy=Readonly<{version:1}&Record<EvidenceStage,EvidenceRule>>;

/** Parse an explicit new-trip policy; legacy trips must not be passed a new default. */
export function parseStageEvidencePolicy(value:unknown):StageEvidencePolicy{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Choose an explicit stage evidence policy.');
  const row=value as Record<string,unknown>,keys=Object.keys(row);
  if(row.version!==1||keys.length!==4||keys.some(k=>!['version',...evidenceStages].includes(k)))throw new Error('Unsupported stage evidence policy.');
  for(const stage of evidenceStages)if(row[stage]!=='optional'&&row[stage]!=='accepted_file')throw new Error('Choose a supported evidence rule for every stage.');
  return Object.freeze({version:1,placement:row.placement,loading:row.loading,arrival:row.arrival}) as StageEvidencePolicy;
}

export type StageEvidenceDocument={
  id:string;
  orgId:string;
  tripId:string;
  purpose:'trip_stage'|'trip_pod'|'operational';
  stage:EvidenceStage;
  allocationId:string|null;
  review:null|{decision:'accept'|'reject';actorRoleAtReview:string;corrected:boolean};
};
export type StageEvidenceContext={orgId:string;tripId:string;activeAllocationIds:readonly string[];documents:readonly StageEvidenceDocument[]};
export type MissingStageEvidence={stage:EvidenceStage;allocationId:string|null};

/**
 * File checklist only, using a trusted server projection after tenant-scoped joins.
 * This does not authorize a user, validate a physical milestone, or permit a transition.
 * Placement is trip-scoped; loading/arrival need a separate accepted file per active allocation.
 */
export function stageEvidenceChecklist(policyValue:unknown,stage:EvidenceStage,context:StageEvidenceContext):{missing:MissingStageEvidence[]}{
  const policy=parseStageEvidencePolicy(policyValue);
  if(!evidenceStages.includes(stage))throw new Error('Choose a supported evidence stage.');
  const validId=(v:unknown)=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=200;
  if(!validId(context.orgId)||!validId(context.tripId)||!context.activeAllocationIds.length||context.activeAllocationIds.some(id=>!validId(id))||new Set(context.activeAllocationIds).size!==context.activeAllocationIds.length)throw new Error('Reload the active trip allocations.');
  // Reject ambiguous projections; one immutable document cannot count for two consignments.
  const ids=new Set<string>();
  for(const doc of context.documents){if(!validId(doc.id)||ids.has(doc.id))throw new Error('Reload the stage evidence records.');ids.add(doc.id);}
  if(policy[stage]==='optional')return {missing:[]};
  const allocations:(string|null)[]=stage==='placement'?[null]:[...context.activeAllocationIds];
  return {missing:allocations.filter(allocationId=>!context.documents.some(doc=>
    doc.orgId===context.orgId&&doc.tripId===context.tripId&&doc.purpose==='trip_stage'&&doc.stage===stage&&doc.allocationId===allocationId&&
    doc.review?.decision==='accept'&&doc.review.actorRoleAtReview==='OWNER'&&doc.review.corrected===false
  )).map(allocationId=>({stage,allocationId}))};
}
