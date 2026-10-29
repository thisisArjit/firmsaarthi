import {test} from 'vitest';
import assert from 'node:assert/strict';
import {parseStageEvidencePolicy,stageEvidenceChecklist,type StageEvidenceDocument,type EvidenceStage} from '../lib/trip-stage-evidence';

const strict={version:1,placement:'accepted_file',loading:'accepted_file',arrival:'accepted_file'};
function document(stage:EvidenceStage,allocationId:string|null,extra:Partial<StageEvidenceDocument>={}):StageEvidenceDocument{return {id:'file-'+stage+'-'+allocationId,orgId:'org-own',tripId:'trip-own',purpose:'trip_stage',stage,allocationId,review:{decision:'accept',actorRoleAtReview:'OWNER',corrected:false},...extra};}
function context(documents:StageEvidenceDocument[]=[]){return {orgId:'org-own',tripId:'trip-own',activeAllocationIds:['allocation-a','allocation-b'],documents};}

test('policy is explicit, strict, copied and frozen rather than attached to existing trips implicitly',()=>{
 const input={...strict},policy=parseStageEvidencePolicy(input);assert.deepEqual(policy,input);assert.notEqual(policy,input);assert.ok(Object.isFrozen(policy));input.placement='optional';assert.equal(policy.placement,'accepted_file');
 for(const invalid of [undefined,null,[],{}, {...strict,version:'1'},{...strict,version:0},{...strict,placement:true},{...strict,loading:'required'},{...strict,arrival:undefined},{...strict,unknown:'optional'}])assert.throws(()=>parseStageEvidencePolicy(invalid));
});

test('placement file is trip-scoped and loading/arrival files are per active consignment',()=>{
 assert.deepEqual(stageEvidenceChecklist(strict,'placement',context()).missing,[{stage:'placement',allocationId:null}]);
 assert.deepEqual(stageEvidenceChecklist(strict,'placement',context([document('placement',null)])).missing,[]);
 assert.equal(stageEvidenceChecklist(strict,'placement',context([document('placement','allocation-a')])).missing.length,1);
 assert.deepEqual(stageEvidenceChecklist(strict,'loading',context([document('loading','allocation-a')])).missing,[{stage:'loading',allocationId:'allocation-b'}]);
 assert.equal(stageEvidenceChecklist(strict,'arrival',context([document('arrival','allocation-a'),document('arrival','allocation-b')])).missing.length,0);
});

test('other tenants, trips, document purposes and stages never satisfy a required checklist',()=>{
 const own=document('loading','allocation-a');
 for(const extra of [{orgId:'org-other'},{tripId:'trip-other'},{purpose:'operational' as const},{purpose:'trip_pod' as const},{stage:'arrival' as const},{allocationId:null},{allocationId:'allocation-removed'}]){
  const result=stageEvidenceChecklist(strict,'loading',context([{...own,...extra}]));assert.equal(result.missing.length,2);
 }
});

test('upload, rejection, corrected acceptance and non-owner review remain missing',()=>{
 for(const review of [null,{decision:'reject' as const,actorRoleAtReview:'OWNER',corrected:false},{decision:'accept' as const,actorRoleAtReview:'OWNER',corrected:true},{decision:'accept' as const,actorRoleAtReview:'MEMBER',corrected:false},{decision:'accept' as const,actorRoleAtReview:'DISPATCHER',corrected:false}])assert.equal(stageEvidenceChecklist(strict,'loading',context([document('loading','allocation-a',{review})])).missing.length,2);
});

test('ambiguous or empty trusted projections fail closed, including duplicate IDs',()=>{
 const doc=document('loading','allocation-a');
 assert.throws(()=>stageEvidenceChecklist(strict,'loading',{...context(),activeAllocationIds:[]}));
 assert.throws(()=>stageEvidenceChecklist(strict,'loading',{...context(),activeAllocationIds:['allocation-a','allocation-a']}));
 assert.throws(()=>stageEvidenceChecklist(strict,'loading',{...context(),orgId:''}));
 assert.throws(()=>stageEvidenceChecklist(strict,'loading',context([doc,{...doc,allocationId:'allocation-b'}])));
 assert.throws(()=>stageEvidenceChecklist(strict,'loading',context([{...doc,id:''}])));
});

test('mixed optional rules and file counts do not manufacture milestones or mutate their inputs',()=>{
 const policy={...strict,loading:'optional'},docs=[document('arrival','allocation-a')],input=context(docs),before=JSON.stringify({policy,input});
 assert.deepEqual(stageEvidenceChecklist(policy,'loading',input),{missing:[]});
 assert.deepEqual(stageEvidenceChecklist(policy,'arrival',input).missing,[{stage:'arrival',allocationId:'allocation-b'}]);
 assert.equal(JSON.stringify({policy,input}),before);
 assert.deepEqual(Object.keys(stageEvidenceChecklist(policy,'placement',input)),['missing']);
});
