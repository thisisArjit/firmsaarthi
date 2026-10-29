'use client';
import type {Row} from '@/lib/domain';
export function stagePlanningSelection(saved:Row|null|undefined){return saved?{stagePolicy:'workspace_v1',stagePolicyVersion:saved.version}:{};}
export function staleStagePlanning(draft:Row,saved:Row|null|undefined){return (draft.stagePolicyVersion??0)!==(saved?.version??0)||!!saved&&draft.stagePolicy!=='workspace_v1';}
export function reviewStagePlanning(draft:Row,saved:Row|null|undefined){const {stagePolicy,stagePolicyVersion,...rest}=draft;return {...rest,...stagePlanningSelection(saved)};}
export default function StagePlanningControls({saved,draft,busy,onReview}:{saved:Row|null|undefined;draft:Row;busy:boolean;onReview:()=>void}){
  const stale=staleStagePlanning(draft,saved);if(!saved&&!stale)return null;
  return <section aria-label="Timeline stage requirements"><h3>Physical stages</h3>{saved&&<p className="help">Current workspace requirements · {(['placement','loading','arrival'] as const).map((stage,index)=><span key={stage}>{index>0?' · ':''}{stage[0].toUpperCase()+stage.slice(1)}: {saved.policy[stage]==='accepted_file'?'owner-accepted file':'optional file'}</span>)}</p>}<p className="help">Placement, loading and arrival are recorded manually. This timeline keeps the requirements reviewed here.</p>{stale&&<p role="status">Stage requirements changed while this form was open. Your consignment, supplier and POD choices are preserved. <button type="button" className="small" disabled={busy} onClick={onReview}>Use latest stage requirements</button></p>}</section>;
}
