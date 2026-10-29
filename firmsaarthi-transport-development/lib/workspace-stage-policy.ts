import {AppError,type TransportService} from './service';
import {parseStageEvidencePolicy,type StageEvidencePolicy} from './trip-stage-evidence';
import type {Row} from './domain';

export type WorkspaceStagePolicy=Readonly<{id:string;version:number;policy:StageEvidencePolicy;createdAt:string}>;
function snapshot(row:Row):WorkspaceStagePolicy{return Object.freeze({id:row.id,version:row.version,policy:parseStageEvidencePolicy({version:row.contract_version,placement:row.placement_rule,loading:row.loading_rule,arrival:row.arrival_rule}),createdAt:row.created_at});}
function expectedVersion(value:unknown):number{
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||value>=Number.MAX_SAFE_INTEGER)throw new AppError('Reload the stage evidence policy before saving.',409);
  return value;
}

// Unpublished storage foundation used by the candidate policy API and opt-in trip creation.
export class WorkspaceStagePolicies{
  constructor(private s:TransportService){}
  async current():Promise<WorkspaceStagePolicy|null>{
    const m=await this.s.member(),row=await this.s.first('SELECT * FROM workspace_stage_policies WHERE org_id=? ORDER BY version DESC LIMIT 1',m.org_id);
    // Absence is not a policy: do not opt old timelines into new physical prerequisites.
    return row?snapshot(row):null;
  }
  async history():Promise<(WorkspaceStagePolicy&{actor:string})[]>{
    const m=await this.s.owner(),rows=await this.s.rows('SELECT * FROM workspace_stage_policies WHERE org_id=? ORDER BY version DESC LIMIT 100',m.org_id);
    return rows.map(row=>({...snapshot(row),actor:row.actor}));
  }
  async save(value:unknown,versionValue:unknown):Promise<WorkspaceStagePolicy>{
    const m=await this.s.owner(),version=expectedVersion(versionValue);let policy:StageEvidencePolicy;
    try{policy=parseStageEvidencePolicy(value);}catch{throw new AppError('Choose a supported rule for every stage evidence requirement.');}
    const id=crypto.randomUUID(),at=new Date().toISOString();
    const result=await this.s.db.batch([
      this.s.statement('INSERT INTO workspace_stage_policies(id,org_id,version,contract_version,placement_rule,loading_rule,arrival_rule,actor,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE ?=COALESCE((SELECT MAX(version) FROM workspace_stage_policies WHERE org_id=?),0) RETURNING id',id,m.org_id,version+1,policy.version,policy.placement,policy.loading,policy.arrival,this.s.user.userId,at,version,m.org_id),
      this.s.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',crypto.randomUUID(),m.org_id,this.s.user.userId,'trip.stage-policy.save',JSON.stringify({id,version:version+1,policy}),at),
    ]);
    if(!result[0].results?.length)throw new AppError('The stage evidence policy changed. Reload before saving.',409);
    return Object.freeze({id,version:version+1,policy,createdAt:at});
  }
}
