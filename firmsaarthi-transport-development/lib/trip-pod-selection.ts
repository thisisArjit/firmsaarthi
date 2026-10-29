import {AppError} from './service';
import {podMode,type PodMode,type WorkspacePodPolicy} from './workspace-pod-policy';
export type PodRequest={contract:'legacy_v1';selection:PodMode}|{contract:'workspace_policy_v1';selection:PodMode|'workspace_v1';version:number;reason:string};
export function podRequest(input:Record<string,unknown>,role:string):PodRequest{
  const selection=input.podPolicy===undefined?'reference_v1':String(input.podPolicy);
  if(!['reference_v1','file_v1','workspace_v1'].includes(selection))throw new AppError('Choose a supported POD policy.');
  if(selection==='file_v1'&&role!=='OWNER')throw new AppError('Only the workspace owner can require POD files when planning a trip.',403);
  if(selection==='workspace_v1'||input.policyVersion!==undefined||input.podOverrideReason!==undefined){
    if(typeof input.policyVersion!=='number'||!Number.isSafeInteger(input.policyVersion)||input.policyVersion<0)throw new AppError('Reload the workspace POD default before planning.',409);
    if(input.podOverrideReason!==undefined&&typeof input.podOverrideReason!=='string')throw new AppError('Enter a valid POD override reason.');
    const reason=String(input.podOverrideReason||'').trim();if(reason.length>500)throw new AppError('Use at most 500 characters for the POD override reason.');
    return {contract:'workspace_policy_v1',selection:selection as PodMode|'workspace_v1',version:input.policyVersion,reason};
  }
  return {contract:'legacy_v1',selection:selection as PodMode};
}
export function selectedPodMode(request:PodRequest,policy:WorkspacePodPolicy,role:string):PodMode{
  if(request.contract==='workspace_policy_v1'&&request.version!==policy.version)throw new AppError('The workspace POD default changed. Reload before planning.',409);
  const mode=request.selection==='workspace_v1'?policy.mode:podMode(request.selection);
  if(policy.mode==='file_v1'&&mode==='reference_v1'){
    if(role!=='OWNER')throw new AppError('Use the workspace POD requirement. Only the owner can approve a weaker requirement.',403);
    if(request.contract!=='workspace_policy_v1'||!request.reason)throw new AppError('Enter an owner override reason to use optional files instead of the required workspace policy.');
  }
  return mode;
}
export function tripPodPayload(base:Record<string,unknown>,mode:PodMode,request:PodRequest,policy:Pick<WorkspacePodPolicy,'id'|'version'|'mode'>){return JSON.stringify({...base,...(mode==='file_v1'?{podPolicy:mode}:{}),podPolicyRequest:request,podPolicySnapshot:{id:policy.id,version:policy.version,mode:policy.mode}});}
export function matchesTripPodReplay(saved:string,base:Record<string,unknown>,request:PodRequest,mode:PodMode){
  const prior=JSON.parse(saved);
  if(prior.podPolicyRequest&&prior.podPolicySnapshot)return tripPodPayload(base,mode,request,prior.podPolicySnapshot)===saved;
  return request.contract==='legacy_v1'&&JSON.stringify({...base,...(request.selection==='file_v1'?{podPolicy:request.selection}:{})})===saved;
}
