import {AppError,type TransportService} from './service';

export type PodMode='reference_v1'|'file_v1';
export type WorkspacePodPolicy={id:string|null;version:number;mode:PodMode;createdAt:string|null};
export function podMode(value:unknown):PodMode{if(value!=='reference_v1'&&value!=='file_v1')throw new AppError('Choose optional POD files or required owner-accepted POD files.');return value;}
function expectedVersion(value:unknown){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw new AppError('Reload the evidence policy before saving.',409);return value;}

// Candidate service and trip snapshot integration; complete the owner/planning UI before release.
export class WorkspacePodPolicies{
  constructor(private s:TransportService){}
  async current():Promise<WorkspacePodPolicy>{const m=await this.s.member(),row=await this.s.first('SELECT id,version,pod_mode,created_at FROM workspace_pod_policies WHERE org_id=? ORDER BY version DESC LIMIT 1',m.org_id);return row?{id:row.id,version:row.version,mode:podMode(row.pod_mode),createdAt:row.created_at}:{id:null,version:0,mode:'reference_v1',createdAt:null};}
  async history(){const m=await this.s.owner();return this.s.rows('SELECT id,version,pod_mode,created_at,actor FROM workspace_pod_policies WHERE org_id=? ORDER BY version DESC LIMIT 100',m.org_id);}
  async save(modeValue:unknown,versionValue:unknown):Promise<WorkspacePodPolicy>{
    const m=await this.s.owner(),mode=podMode(modeValue),version=expectedVersion(versionValue),at=new Date().toISOString(),id=crypto.randomUUID();
    const result=await this.s.db.batch([
      this.s.statement('INSERT INTO workspace_pod_policies(id,org_id,version,pod_mode,actor,created_at) SELECT ?,?,?,?,?,? WHERE ?=COALESCE((SELECT MAX(version) FROM workspace_pod_policies WHERE org_id=?),0) RETURNING id',id,m.org_id,version+1,mode,this.s.user.userId,at,version,m.org_id),
      this.s.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',crypto.randomUUID(),m.org_id,this.s.user.userId,'trip.evidence-policy.save',JSON.stringify({id,version:version+1,podMode:mode}),at),
    ]);
    if(!result[0].results?.length)throw new AppError('The evidence policy changed. Reload before saving.',409);
    return this.current();
  }
}
