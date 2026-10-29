'use client';
import SortableTable from './sortable-table';
import type {Row} from '@/lib/domain';
import type {tripStageSummary,PhysicalNextAction} from '@/lib/trip-stage-summary';

type Summary=NonNullable<ReturnType<typeof tripStageSummary>>;
type Slot=Summary['placement'];
const time=(value:string|null)=>value?new Date(value).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'}):'Not recorded';
function StageStatus({slot}:{slot:Slot}){
 if(slot.recorded)return <details><summary>Recorded manually</summary><p className="help">Actual (IST): {time(slot.actualAt)}<br/>Recorded (IST): {time(slot.recordedAt)}</p></details>;
 return <span>{slot.fileRequired?(slot.fileAccepted?'Ready to record':'Accepted file needed'):'Not recorded'}</span>;
}

/** Only consumes the server's scoped readiness summary, never private proof metadata. */
export default function TripStageProgress({summary,items,busy,owner,onStart}:{summary:Summary;items:readonly Row[];busy:boolean;owner:boolean;onStart:(action:PhysicalNextAction)=>void}){
 const name=(id:string)=>items.find(item=>item.id===id)?.snapshot?.cn||'Consignment';
 return <section aria-label="Physical stage progress">
  <h3>Stage progress</h3><p className="help">Saved requirements · revision {summary.sourceVersion}. Physical progress is entered manually; file acceptance is a separate owner review.</p>
  <div className="inline"><strong>Truck placement</strong><StageStatus slot={summary.placement}/></div>
  <div className="table-scroll"><SortableTable><thead><tr><th>Consignment</th><th>Loading</th><th>Arrival</th><th>Delivery</th></tr></thead><tbody>{summary.items.map(item=><tr key={item.allocationId}><td>{name(item.allocationId)}</td><td><StageStatus slot={item.loading}/></td><td><StageStatus slot={item.arrival}/></td><td>{item.deliveryRecorded?'Recorded manually':'Not recorded'}</td></tr>)}</tbody></SortableTable></div>
  {summary.nextActions.length>0&&<><h3>Next step</h3>{summary.nextActions.map(action=>{
   const label=action.label+(action.allocationId?' · '+name(action.allocationId):'');
   return <div key={action.kind+':'+(action.allocationId||'')} className="trip-exception"><div><strong>{label}</strong>{action.blocked&&<p className="help">{action.reason} {owner?'Upload and review the stage file before recording this step.':'Ask the workspace owner to upload and review the stage file.'}</p>}</div><button type="button" className="small" aria-label={label} disabled={busy||action.blocked} onClick={()=>{if(!busy&&!action.blocked)onStart(action);}}>{action.label}</button></div>;
  })}</>}
 </section>;
}
