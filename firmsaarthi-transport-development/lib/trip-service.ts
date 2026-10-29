import { AppError, type TransportService } from './service';
import { checkYear, required, type Row } from './domain';
import { actualTime, tripProgress, vehicleRegistration } from './trip-domain';
import { operationalBooking } from './access';
import { SharedService } from './shared-service';
import {WorkspacePodPolicies} from './workspace-pod-policy';
import {podRequest,selectedPodMode,tripPodPayload,matchesTripPodReplay} from './trip-pod-selection';
import {WorkspaceStagePolicies} from './workspace-stage-policy';
import {stagePolicyRequest,appendTripStageSnapshot,stageReplayPayload} from './trip-stage-selection';
import {TripStageService} from './trip-stage-service';
import {tripStageSummary,type StageProofFlag} from './trip-stage-summary';
const now=()=>new Date().toISOString(),id=()=>crypto.randomUUID();
function requestKey(value:unknown){const key=required(value,'Request ID',80);if(!/^[a-zA-Z0-9-]{8,80}$/.test(key))throw new AppError('Invalid request ID.');return key;}
function optional(value:unknown,max:number){const text=String(value||'').trim();if(text.length>max)throw new AppError(`Use at most ${max} characters.`);return text;}
export class TripService {
  constructor(private s:TransportService){}
  async detail(tripId:string,attempt=0):Promise<Row>{
    const s=this.s,m=await s.member(),trip=await s.owned('trips',tripId,m.org_id);
    const allocations=await s.rows('SELECT a.*,c.freight AS current_freight,i.invoice_id FROM trip_allocations a JOIN consignments c ON c.id=a.consignment_id AND c.org_id=a.org_id LEFT JOIN invoice_items i ON i.consignment_id=c.id WHERE a.org_id=? AND a.trip_id=? ORDER BY a.id',m.org_id,trip.id);
    const storedEvents=await s.rows('SELECT * FROM trip_events WHERE org_id=? AND trip_id=? ORDER BY version',m.org_id,trip.id);
    // Private stage review/use links are internal enforcement data, including in nested progress rows.
    const events=m.role==='OWNER'?storedEvents:storedEvents.map(e=>{try{const {stageTransition,...payload}=JSON.parse(e.payload);return {...e,payload:JSON.stringify(payload)};}catch{return {...e,payload:'{}'};}});
    const commercial=m.role!=='DISPATCHER',parsed=allocations.map(a=>commercial?{...a,snapshot:JSON.parse(a.snapshot)}:{id:a.id,consignment_id:a.consignment_id,active:a.active,snapshot:operationalBooking(JSON.parse(a.snapshot))});
    const progress=tripProgress(parsed,events);
    const documents=m.role==='OWNER'?await s.rows('SELECT d.*,a.name,a.mime FROM trip_documents d JOIN assets a ON a.id=d.asset_id AND a.org_id=d.org_id WHERE d.org_id=? AND d.trip_id=? ORDER BY d.created_at,d.id',m.org_id,trip.id):[];
    const evidence=await s.rows('SELECT r.event_id FROM trip_document_reviews r JOIN trip_documents d ON d.id=r.document_id AND d.org_id=r.org_id JOIN trip_events e ON e.id=r.event_id AND e.org_id=r.org_id AND e.trip_id=d.trip_id AND e.allocation_id=d.allocation_id WHERE r.org_id=? AND d.trip_id=?',m.org_id,trip.id);
    const fileReviewIds=new Set(evidence.map(r=>r.event_id));
    const requiredFiles=trip.pod_policy==='file_v1';
    for(const item of progress.items){item.podFileAccepted=item.pod?.kind==='pod_accept'&&fileReviewIds.has(item.pod.id);if(requiredFiles&&item.delivery&&!item.podFileAccepted)item.progress='POD file acceptance required';}
    const requiredPodRemaining=requiredFiles?progress.items.filter((a:Row)=>!a.podFileAccepted).length:0;
    progress.readyToClose=progress.readyToClose&&requiredPodRemaining===0;
    if(requiredFiles)progress.accepted=progress.items.filter((a:Row)=>a.podFileAccepted).length;
    const reviews=m.role==='OWNER'?await s.rows('SELECT r.* FROM trip_document_reviews r JOIN trip_events e ON e.id=r.event_id AND e.org_id=r.org_id WHERE r.org_id=? AND e.trip_id=?',m.org_id,trip.id):[];
    for(const doc of documents){const ids=new Set(reviews.filter(r=>r.document_id===doc.id).map(r=>r.event_id));doc.reviews=events.filter(e=>ids.has(e.id));doc.review=progress.active.filter((e:Row)=>ids.has(e.id)).at(-1)||null;doc.status=doc.review?.kind==='pod_accept'?'Accepted':doc.review?.kind==='pod_reject'?'Rejected':'Awaiting review';delete doc.payload;}
    let stageWorkflow:ReturnType<typeof tripStageSummary>;
    if(JSON.parse(trip.creation_payload).stagePolicySnapshot){
      const flags=await s.rows("SELECT d.stage,d.allocation_id,MAX(CASE WHEN r.kind='accept' AND r.actor_role='OWNER' THEN 1 ELSE 0 END) AS accepted FROM trip_stage_documents d JOIN asset_scopes scope ON scope.asset_id=d.asset_id AND scope.org_id=d.org_id AND scope.purpose='trip_stage' LEFT JOIN trip_stage_reviews r ON r.document_id=d.id AND r.org_id=d.org_id AND r.trip_id=d.trip_id AND r.kind<>'correction' AND NOT EXISTS(SELECT 1 FROM trip_stage_reviews c WHERE c.org_id=r.org_id AND c.trip_id=r.trip_id AND c.kind='correction' AND c.target_id=r.id) WHERE d.org_id=? AND d.trip_id=? GROUP BY d.stage,d.allocation_id",m.org_id,trip.id);
      try{stageWorkflow=tripStageSummary(trip,allocations,events,flags as StageProofFlag[]);}catch{throw new AppError('Stage progress is inconsistent. Reload or contact the workspace owner.',409);}
    }
    // Every event/file/review claim advances trip.version. Retry once instead of serving mixed revisions.
    const latest=await s.first('SELECT t.version,m.role FROM trips t JOIN memberships m ON m.org_id=t.org_id AND m.user_id=? WHERE t.id=? AND t.org_id=?',s.user.userId,trip.id,m.org_id);
    if(!latest||!['OWNER','MEMBER','DISPATCHER'].includes(latest.role))throw new AppError('Trip access changed. Reload the workspace.',403);
    if(latest.version!==trip.version||latest.role!==m.role){if(attempt<1)return this.detail(tripId,attempt+1);throw new AppError('This trip changed while loading. Reload to see current progress.',409);}
    const safeTrip=commercial?trip:Object.fromEntries(Object.entries(trip).filter(([key])=>key!=='creation_payload'));return {trip:safeTrip,events,...progress,documents,requiredPodRemaining,owner:m.role==='OWNER',commercial,...(stageWorkflow?{stageWorkflow}:{})};
  }
  async state():Promise<Row>{
    const s=this.s,m=await s.member(),org=m.org_id;
    const vehicles=await new SharedService(s).vehicles(org);
    const [trips,suppliers,eligible,ready]=await Promise.all([
      s.rows("SELECT t.*,COUNT(a.id) AS consignment_count,GROUP_CONCAT(json_extract(a.snapshot,'$.cn'),' / ') AS consignment_numbers FROM trips t LEFT JOIN trip_allocations a ON a.trip_id=t.id AND a.org_id=t.org_id WHERE t.org_id=? GROUP BY t.id ORDER BY t.created_at DESC LIMIT 300",org),
      s.rows("SELECT id,code,name FROM parties WHERE org_id=? AND kind='supplier' ORDER BY name,code",org),
      s.rows('SELECT c.id,c.cn,c.year,c.date,c.company,c.truck,c.origin,c.destination,c.provider,c.freight FROM consignments c WHERE c.org_id=? AND NOT EXISTS(SELECT 1 FROM trip_allocations a JOIN trips t ON t.id=a.trip_id AND t.org_id=a.org_id WHERE a.org_id=c.org_id AND a.consignment_id=c.id AND (a.active=1 OR json_extract(t.creation_payload,\'$.identity\')=\'consignment_v1\')) ORDER BY c.date DESC,c.cn LIMIT 500',org),
      s.rows("SELECT c.id,c.cn,c.year,c.company,c.freight,t.number AS trip_number,t.id AS trip_id FROM trip_allocations a JOIN consignments c ON c.id=a.consignment_id AND c.org_id=a.org_id JOIN trips t ON t.id=a.trip_id AND t.org_id=a.org_id WHERE a.org_id=? AND a.active=1 AND t.status IN('dispatched','closed') AND NOT EXISTS(SELECT 1 FROM invoice_items i WHERE i.consignment_id=c.id) AND EXISTS(SELECT 1 FROM trip_events e WHERE e.org_id=a.org_id AND e.trip_id=a.trip_id AND e.allocation_id=a.id AND e.kind='pod_accept' AND (t.pod_policy<>'file_v1' OR EXISTS(SELECT 1 FROM trip_document_reviews dr JOIN trip_documents dd ON dd.id=dr.document_id AND dd.org_id=dr.org_id WHERE dr.event_id=e.id AND dr.org_id=e.org_id AND dd.trip_id=e.trip_id AND dd.allocation_id=e.allocation_id)) AND NOT EXISTS(SELECT 1 FROM trip_events x WHERE x.org_id=e.org_id AND x.trip_id=e.trip_id AND x.kind='correction' AND x.target_event_id=e.id) AND NOT EXISTS(SELECT 1 FROM trip_events r WHERE r.org_id=e.org_id AND r.trip_id=e.trip_id AND r.allocation_id=e.allocation_id AND r.kind='pod_reject' AND r.version>e.version AND NOT EXISTS(SELECT 1 FROM trip_events y WHERE y.org_id=r.org_id AND y.trip_id=r.trip_id AND y.kind='correction' AND y.target_event_id=r.id))) ORDER BY c.date,c.cn LIMIT 500",org),
    ]);
    const commercial=m.role!=='DISPATCHER';return {vehicles,trips:commercial?trips:trips.map(t=>Object.fromEntries(Object.entries(t).filter(([key])=>key!=='creation_payload'))),suppliers,eligible:commercial?eligible:eligible.map(operationalBooking),ready:commercial?ready:[],podDefault:await new WorkspacePodPolicies(s).current(),stageDefault:await new WorkspaceStagePolicies(s).current(),owner:m.role==='OWNER',commercial,limits:{trips:300,eligible:500,ready:500}};
  }
  async command(action:string,d:Row):Promise<Row>{
    const s=this.s,m=await s.member(),org=m.org_id;
    if(action==='trip.create'){
      const booking=d.consignmentId?await s.owned('consignments',String(d.consignmentId),org):null;
      if(booking&&(d.number!==undefined&&d.number!==booking.cn||d.ids!==undefined&&(!Array.isArray(d.ids)||d.ids.length!==1||d.ids[0]!==booking.id)))throw new AppError('The trip ID must be the selected consignment number. Track one consignment at a time.');
      const year=checkYear(booking?.year||d.year),number=booking?booking.cn:required(d.number,'Trip number',50).toUpperCase(),registration=vehicleRegistration(d.registration),supplier=await s.owned('parties',String(d.supplierId),org),key=requestKey(d.requestId);
      const policyRequest=podRequest(d,m.role),stageRequest=stagePolicyRequest(d);
      if(supplier.kind!=='supplier')throw new AppError('Choose a supplier account for the hired truck.');
      const ids=booking?[booking.id]:Array.isArray(d.ids)?[...new Set(d.ids.map(String))].sort():[];if(!ids.length||ids.length>50)throw new AppError('Select 1–50 consignments for the trip.');
      const base={year,number,registration,supplierId:supplier.id,ids,...(booking?{identity:'consignment_v1'}:{})},tripId=`trip_${org}_${key}`,old=await s.first('SELECT * FROM trips WHERE id=? AND org_id=?',tripId,org);
      // Replays use their immutable original snapshot, before considering a newer default.
      if(old){const replay=stageReplayPayload(old.creation_payload,stageRequest);if(replay===null||!matchesTripPodReplay(replay,base,policyRequest,old.pod_policy))throw new AppError('This request ID was used with different trip details.',409);return {success:true,id:tripId,alreadyRecorded:true};}
      const policy=await new WorkspacePodPolicies(s).current(),podPolicy=selectedPodMode(policyRequest,policy,m.role),stagePolicy=await new WorkspaceStagePolicies(s).current(),payload=appendTripStageSnapshot(tripPodPayload(base,podPolicy,policyRequest,policy),stageRequest,stagePolicy);
      if(booking&&await s.first('SELECT a.id FROM trip_allocations a JOIN trips t ON t.id=a.trip_id AND t.org_id=a.org_id WHERE a.org_id=? AND a.consignment_id=? AND (a.active=1 OR json_extract(t.creation_payload,\'$.identity\')=\'consignment_v1\') LIMIT 1',org,booking.id))throw new AppError('Trip tracking already exists for this consignment. Open its existing history.',409);
      const consignments:Row[]=[];
      for(const cnId of ids){const c=await s.owned('consignments',cnId,org);if(vehicleRegistration(c.truck)!==registration)throw new AppError(`Truck on consignment ${c.cn} does not match this trip. Update the booking first.`);if(c.provider&&c.supplier_party_id!==supplier.id&&c.provider!==supplier.name)throw new AppError(`Review the provider account on consignment ${c.cn} before allocation.`);consignments.push(c);}
      const t=now(),vehicleId=id();
      try{await s.db.batch([
        s.statement('INSERT INTO trip_vehicles (id,org_id,registration,created_at) VALUES (?,?,?,?) ON CONFLICT(org_id,registration) DO NOTHING',vehicleId,org,registration,t),
        s.statement("INSERT INTO trips (id,org_id,year,number,vehicle_id,vehicle_snapshot,supplier_party_id,supplier_snapshot,status,version,creation_payload,created_at,created_by,pod_policy) SELECT ?,?,?,?,id,?,?,?,'planned',1,?,?,?,? FROM trip_vehicles WHERE org_id=? AND registration=? AND ?=COALESCE((SELECT MAX(version) FROM workspace_pod_policies WHERE org_id=?),0) AND ?=COALESCE((SELECT MAX(version) FROM workspace_stage_policies WHERE org_id=?),0)",tripId,org,year,number,registration,supplier.id,`${supplier.code} · ${supplier.name}`,payload,t,s.user.userId,podPolicy,org,registration,policy.version,org,stagePolicy?.version??0,org),
        ...consignments.map(c=>s.insert('trip_allocations',{id:id(),org_id:org,trip_id:tripId,consignment_id:c.id,snapshot:JSON.stringify({cn:c.cn,year:c.year,date:c.date,company:c.company,truck:c.truck,origin:c.origin,destination:c.destination,provider:c.provider,freight:c.freight}),active:1})),s.audit(org,action,tripId),
      ]);}catch(e){if((await new WorkspacePodPolicies(s).current()).version!==policy.version)throw new AppError('The workspace POD default changed. Reload before planning.',409);if(((await new WorkspaceStagePolicies(s).current())?.version??0)!==(stagePolicy?.version??0))throw new AppError('The workspace stage evidence policy changed. Reload before planning.',409);throw e;}return {success:true,id:tripId};
    }
    if(action!=='trip.event')throw new AppError('Unknown trip action.',404);
    // Only an immutable explicit opt-in selects the new path. Original/legacy replays stay independent.
    let contract:Row|null;try{contract=await s.first("SELECT json_extract(creation_payload,'$.stagePolicyRequest.contract') AS contract,json_type(creation_payload,'$.stagePolicySnapshot') AS snapshot FROM trips WHERE id=? AND org_id=?",String(d.tripId),org);}catch{throw new AppError('Unable to load this trip. Reload and try again.',500);}
    if((contract?.contract||contract?.snapshot)&&d.kind!=='cancel'){
      if(contract.contract!=='workspace_stage_v1'||contract.snapshot!=='object')throw new AppError('The saved stage requirement is incomplete. Contact the workspace owner.',409);
      try{return await new TripStageService(s).record(d);}catch(error){
        if(error instanceof AppError)throw error;
        if(error instanceof Error&&/UNIQUE constraint|FOREIGN KEY constraint/i.test(error.message))throw new AppError('This event conflicts with a recent change. Reload and try again.',409);
        throw new AppError('Unable to record this trip event. Reload and try again.',500);
      }
    }
    const state=await this.detail(String(d.tripId)),trip=state.trip,kind=String(d.kind),key=requestKey(d.requestId),eventId=`trip_event_${trip.id}_${key}`;
    if(!['dispatch','delivery','pod_accept','pod_reject','exception','exception_resolve','close','cancel','correction'].includes(kind))throw new AppError('Choose a supported trip event.');
    if(['pod_accept','pod_reject','close','cancel','correction'].includes(kind)&&m.role!=='OWNER')throw new AppError('Only the workspace owner can review POD, close, cancel or correct trips.',403);
    const eventAt=actualTime(d.eventAt),allocationId=d.allocationId?String(d.allocationId):null,targetId=d.targetEventId?String(d.targetEventId):null,reference=optional(d.reference,200),note=optional(d.note,500);
    const documentId=d.documentId?String(d.documentId):null;
    if(documentId&&!['pod_accept','pod_reject'].includes(kind))throw new AppError('A POD document belongs only on a POD review.');
    const payload=JSON.stringify({kind,eventAt,allocationId,targetId,reference,note,...(documentId?{documentId}:{})}),old=await s.first('SELECT * FROM trip_events WHERE id=? AND org_id=?',eventId,org);
    if(old){if(old.payload!==payload)throw new AppError('This request ID was used with different event details.',409);return {success:true,id:eventId,alreadyRecorded:true};}
    if(Number(d.version)!==trip.version)throw new AppError('This trip changed. Refresh before continuing.',409);
    const item=allocationId?state.items.find((a:Row)=>a.id===allocationId):null,target=targetId?state.active.find((e:Row)=>e.id===targetId):null;
    if(kind==='pod_accept'&&trip.pod_policy==='file_v1'&&!documentId)throw new AppError('This trip requires an uploaded POD file. Upload and review a file for this consignment.');
    if(documentId){const doc=state.documents.find((v:Row)=>v.id===documentId&&v.allocation_id===allocationId);if(!doc)throw new AppError('Choose a document belonging to this trip and consignment.');if(eventAt<doc.created_at)throw new AppError('POD review time cannot be before the document upload.');}
    if(['delivery','pod_accept','pod_reject'].includes(kind)){if(!item)throw new AppError('Choose a consignment belonging to this trip.');}else if(allocationId)throw new AppError('This event applies to the whole trip.');
    if(!['correction','exception_resolve'].includes(kind)&&targetId)throw new AppError('This event must not refer to another event.');
    const after=(value:string,label:string)=>{if(eventAt<value)throw new AppError(`Event time cannot be before ${label}.`);};
    let status=trip.status;
    if(kind==='correction'){
      if(!target||target.kind==='cancel'||state.active.at(-1)?.id!==target.id)throw new AppError('Correct the latest active event first. Cancelled trips cannot be reopened.');
      required(note,'Correction reason',500);after(target.event_at,'the original event');
      status=tripProgress(state.items,state.events.filter((e:Row)=>e.id!==target.id)).status;
    }else{
      if(['closed','cancelled'].includes(trip.status))throw new AppError('This trip is closed or cancelled. Correct the closing event first where applicable.');
      if(kind==='cancel'){if(trip.status!=='planned')throw new AppError('Only a planned trip can be cancelled. Dispatched-trip return handling is not available yet.');required(note,'Cancellation reason',500);}
      else if(kind==='dispatch'){if(trip.status!=='planned')throw new AppError('This trip has already departed.');for(const a of state.items)after(new Date(`${a.snapshot.date}T00:00:00+05:30`).toISOString(),'the consignment date');status='dispatched';}
      else{
        if(!state.dispatch)throw new AppError('Record departure before delivery, POD or exceptions.');after(state.dispatch.event_at,'departure');
        if(kind==='delivery'){if(item.delivery)throw new AppError('Delivery is already recorded. Correct the existing event first.');required(reference,'Delivery / receiver reference',200);}
        if(kind==='pod_accept'||kind==='pod_reject'){if(!item.delivery)throw new AppError('Record delivery before reviewing POD.');after(item.delivery.event_at,'delivery');if(item.pod)after(item.pod.event_at,'the previous POD review');if(kind==='pod_accept'){required(reference,'POD document reference',200);if(item.pod?.kind==='pod_accept')throw new AppError('POD is already accepted. Correct the previous review first.');}else required(note,'POD rejection reason',500);}
        if(kind==='exception')required(note,'Exception details',500);
        if(kind==='exception_resolve'){if(!target||!state.exceptions.some((e:Row)=>e.id===target.id))throw new AppError('Choose an unresolved exception from this trip.');required(note,'Resolution details',500);after(target.event_at,'the exception');}
        if(kind==='close'){if(state.requiredPodRemaining>0)throw new AppError('Accept an uploaded POD file for every consignment before closing this trip.');if(!state.readyToClose)throw new AppError('Deliver every consignment, accept each POD and resolve open exceptions before closing.');for(const e of state.active)after(e.event_at,'the latest trip event');status='closed';}
      }
      if(kind==='cancel')status='cancelled';
    }
    // Version claim and vehicle availability are checked in the same serialized SQL write.
    const projected=tripProgress(state.items,[...state.events,{id:eventId,kind,allocation_id:allocationId,target_event_id:targetId,event_at:eventAt}]);
    const auditId=id(),t=now(),result=await s.db.batch([
      s.statement("UPDATE trips SET status=?,version=version+1 WHERE id=? AND org_id=? AND version=? AND (?<>'dispatched' OR NOT EXISTS(SELECT 1 FROM trips other WHERE other.org_id=trips.org_id AND other.vehicle_id=trips.vehicle_id AND other.status='dispatched' AND other.id<>trips.id AND (json_extract(trips.creation_payload,'$.identity') IS NOT 'consignment_v1' OR json_extract(other.creation_payload,'$.identity') IS NOT 'consignment_v1'))) RETURNING id",status,trip.id,org,trip.version,status),
      s.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',auditId,org,s.user.userId,`trip.${kind}`,trip.id,t),
      s.statement('INSERT INTO trip_events (id,org_id,trip_id,version,kind,allocation_id,target_event_id,event_at,reference,note,payload,actor,recorded_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM audit WHERE id=? AND org_id=?)',eventId,org,trip.id,trip.version+1,kind,allocationId,targetId,eventAt,reference,note,payload,s.user.userId,t,auditId,org),
      ...(documentId?[s.statement('INSERT INTO trip_document_reviews SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM audit WHERE id=? AND org_id=?)',eventId,documentId,org,auditId,org)]:[]),
      ...(kind==='cancel'?[s.statement('UPDATE trip_allocations SET active=0 WHERE org_id=? AND trip_id=? AND EXISTS(SELECT 1 FROM audit WHERE id=? AND org_id=?)',org,trip.id,auditId,org)]:[]),
      ...(['dispatch','delivery','correction'].includes(kind)?projected.items.map((item:Row)=>s.statement('UPDATE consignments SET stage_status=?,stage_version=stage_version+1 WHERE id=? AND org_id=? AND EXISTS(SELECT 1 FROM audit WHERE id=? AND org_id=?)',item.delivery?'complete':projected.dispatch?'in_progress':'initiated',item.consignment_id,org,auditId,org)):[]),
    ]);
    if(!result[0].results?.length)throw new AppError('This trip changed or this truck is already dispatched on another trip. Refresh before continuing.',409);
    return {success:true,id:eventId};
  }
}
