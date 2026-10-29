import {AppError} from './service';
import {parseStageEvidencePolicy} from './trip-stage-evidence';
import type {WorkspaceStagePolicy} from './workspace-stage-policy';

export type StagePolicyRequest={contract:'workspace_stage_v1';version:number}|null;
export function stagePolicyRequest(input:Record<string,unknown>):StagePolicyRequest{
  if(['stagePolicyRequest','stagePolicySnapshot'].some(key=>Object.hasOwn(input,key)))throw new AppError('Stage policy sources are selected by the server.');
  if(input.stagePolicy===undefined&&input.stagePolicyVersion===undefined)return null;
  if(input.stagePolicy!=='workspace_v1')throw new AppError('Choose the workspace stage evidence policy. Stage overrides are unavailable.');
  if(typeof input.stagePolicyVersion!=='number'||!Number.isSafeInteger(input.stagePolicyVersion)||input.stagePolicyVersion<1)throw new AppError('Reload the workspace stage evidence policy before planning.',409);
  return {contract:'workspace_stage_v1',version:input.stagePolicyVersion};
}

export function appendTripStageSnapshot(payload:string,request:StagePolicyRequest,current:WorkspaceStagePolicy|null):string{
  if(!request){if(current)throw new AppError('Review the workspace stage evidence policy before planning a new trip.',409);return payload;}
  if(!current||current.version!==request.version)throw new AppError('The workspace stage evidence policy changed. Reload before planning.',409);
  // Version 1 only inherits the exact source rules; it has no weakening override.
  return JSON.stringify({...JSON.parse(payload),stagePolicyRequest:request,stagePolicySnapshot:{id:current.id,version:current.version,policy:parseStageEvidencePolicy(current.policy)}});
}

/** Remove only a matching immutable stage envelope before the existing POD replay check. */
export function stageReplayPayload(saved:string,request:StagePolicyRequest):string|null{
  const prior=JSON.parse(saved),hasRequest=Object.hasOwn(prior,'stagePolicyRequest'),hasSnapshot=Object.hasOwn(prior,'stagePolicySnapshot');
  if(!hasRequest&&!hasSnapshot)return request===null?saved:null;
  if(!request||!hasRequest||!hasSnapshot)return null;
  const stored=prior.stagePolicyRequest,source=prior.stagePolicySnapshot;
  if(!stored||Object.keys(stored).length!==2||stored.contract!==request.contract||stored.version!==request.version||!source||Object.keys(source).length!==3||typeof source.id!=='string'||!source.id||source.version!==request.version)return null;
  try{parseStageEvidencePolicy(source.policy);}catch{return null;}
  const {stagePolicyRequest:ignoredRequest,stagePolicySnapshot:ignoredSnapshot,...podPayload}=prior;
  return JSON.stringify(podPayload);
}
