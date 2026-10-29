'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {workspaceFetch,useWorkspaceRevision} from '@/lib/workspace-sync';
import type {Row} from '@/lib/domain';

const names:Record<string,string>={placement:'Truck placement',loading:'Loading',arrival:'Arrival'};
const istNow=()=>new Date(Date.now()+330*60000).toISOString().slice(0,23);
const stamp=(value:string)=>new Date(value).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'});
type Snapshot={tripId:string;version:number;status:string;documents:Row[];reviews:Row[]};

export default function StageDocumentsPanel({detail,busy,onSaving,onSaved}:{detail:Row;busy:boolean;onSaving:(value:boolean)=>void;onSaved:()=>Promise<void>}){
 const revision=useWorkspaceRevision(),sequence=useRef(0);
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[loading,setLoading]=useState(true),[denied,setDenied]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [stage,setStage]=useState(detail.status==='dispatched'?'arrival':'placement'),[allocation,setAllocation]=useState(''),[file,setFile]=useState<File|null>(null),[uploadVersion,setUploadVersion]=useState<number|null>(null),[uploadRequest,setUploadRequest]=useState(''),[fileKey,setFileKey]=useState(0),[review,setReview]=useState<Row|null>(null);
 const tripId=detail.trip.id;
 const clearPrivate=useCallback(()=>{setDenied(true);setSnapshot(null);setFile(null);setReview(null);setFileKey(k=>k+1);},[]);
 const load=useCallback(async()=>{
  const order=++sequence.current;setLoading(true);
  try{
   const response=await workspaceFetch('/api/tms/stage-documents?tripId='+encodeURIComponent(tripId)),value=await response.json() as Row;
   if(order!==sequence.current)return;
   if(!response.ok){if([401,403,404].includes(response.status))clearPrivate();throw new Error(value.error||'Unable to load stage files.');}
   if(value.tripId!==tripId||!Number.isSafeInteger(value.version)||value.version<1||!Array.isArray(value.documents)||!Array.isArray(value.reviews))throw new Error('Reload the current trip before viewing files.');
   setDenied(false);setSnapshot(current=>!current||value.version>=current.version?value as Snapshot:current);
  }catch(e){if(order===sequence.current)setError((e as Error).message);}
  finally{if(order===sequence.current)setLoading(false);}
 },[tripId,clearPrivate]);
 useEffect(()=>{void load();return()=>{sequence.current++;};},[load,revision,detail.trip.version]);
 const current=!!snapshot&&snapshot.version===detail.trip.version&&!loading&&!denied;
 const locked=busy||saving||!current;
 const open=(which:string)=>snapshot?.status==='planned'?which==='placement'||which==='loading':snapshot?.status==='dispatched'&&which==='arrival';
 const activeItems=detail.items.filter((item:Row)=>item.active===1);
 const reviewsFor=(id:string)=>snapshot?.reviews.filter(r=>r.document_id===id)||[];
 const activeReview=(id:string)=>{const history=reviewsFor(id),corrected=new Set(history.filter(r=>r.kind==='correction').map(r=>r.target_id));return history.filter(r=>r.kind!=='correction'&&!corrected.has(r.id)).at(-1)||null;};
 const staleUpload=file&&uploadVersion!==snapshot?.version;
 const selectedDocument=review&&snapshot?.documents.find(d=>d.id===review.documentId);
 const target=review&&activeReview(review.documentId);
 const reviewCurrent=!!review&&!!selectedDocument&&open(selectedDocument.stage)&&(review.kind==='correction'?target?.id===review.targetId:!target);
 function selectScope(nextStage:string,nextAllocation:string){setStage(nextStage);setAllocation(nextStage==='placement'?'':nextAllocation);setUploadVersion(snapshot?.version??null);setUploadRequest(crypto.randomUUID());setError('');}
 function chooseFile(next:File|null){
  setError('');if(next&&(!next.size||next.size>2097152||!['application/pdf','image/jpeg','image/png'].includes(next.type))){setFile(null);setError('Choose a PDF, PNG or JPEG up to 2 MB.');return;}
  setFile(next);setUploadVersion(snapshot?.version??null);setUploadRequest(crypto.randomUUID());
 }
 async function afterSave(message:string){setNotice(message);await load();await onSaved();}
 async function upload(event:FormEvent){
  event.preventDefault();if(locked||!file||staleUpload||!open(stage)||(stage!=='placement'&&!allocation))return;
  setSaving(true);onSaving(true);setError('');setNotice('');
  try{
   const form=new FormData();form.set('tripId',tripId);form.set('stage',stage);if(stage!=='placement')form.set('allocationId',allocation);form.set('version',String(uploadVersion));form.set('requestId',uploadRequest);form.set('file',file);
   const response=await workspaceFetch('/api/tms/stage-documents',{method:'POST',body:form}),value=await response.json() as Row;if(!response.ok){if(response.status===401||response.status===403)clearPrivate();throw new Error(value.error||'Unable to upload stage file.');}
   setFile(null);setUploadVersion(null);setFileKey(k=>k+1);await afterSave('Stage file uploaded. Owner review is still required.');
  }catch(e){setError((e as Error).message);}finally{setSaving(false);onSaving(false);}
 }
 function startReview(doc:Row){const active=activeReview(doc.id);setError('');setNotice('');setReview({documentId:doc.id,kind:active?'correction':'accept',targetId:active?.id||null,version:snapshot!.version,eventAt:istNow(),note:'',requestId:crypto.randomUUID()});}
 async function saveReview(event:FormEvent){
  event.preventDefault();if(locked||!review||!reviewCurrent||review.version!==snapshot?.version)return;
  setSaving(true);onSaving(true);setError('');setNotice('');
  try{
   const payload={...review,tripId,eventAt:new Date(review.eventAt+'+05:30').toISOString()};
   const response=await workspaceFetch('/api/tms/stage-reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),value=await response.json() as Row;if(!response.ok){if(response.status===401||response.status===403)clearPrivate();throw new Error(value.error||'Unable to save stage review.');}
   setReview(null);await afterSave('Stage file review saved. Physical progress remains a separate step.');
  }catch(e){setError((e as Error).message);}finally{setSaving(false);onSaving(false);}
 }
 if(denied)return <section aria-label="Private stage documents"><p role="alert">Stage document access is unavailable. Private files and unfinished selections have been cleared.</p></section>;
 return <details className="optional-fields" open><summary>Private stage documents ({snapshot?.documents.length??0})</summary>
  <p className="help">Owner-only upload and manual review. Uploading does not accept a file or record a physical stage. PDF, PNG or JPEG, up to 2 MB. Do not upload identity or bank documents here.</p>
  {error&&<p className="alert error" role="alert">{error}{file?' Your selected file is retained.':''}</p>}{notice&&<p className="alert success" role="status">{notice}</p>}
  <button type="button" className="small" disabled={busy||saving||loading} onClick={async()=>{try{await load();await onSaved();}catch(e){setError((e as Error).message);}}}>Reload stage files</button>
  {loading&&<p className="help">Loading private stage files…</p>}{snapshot&&!current&&!loading&&<p role="status">Trip progress changed. Reload the trip to review its latest status before saving files or decisions. Your draft is retained.</p>}
  {snapshot&&['planned','dispatched'].includes(snapshot.status)&&<form onSubmit={upload} aria-label="Upload stage evidence"><div className="form-grid">
   <label className="field"><span>Evidence stage</span><select aria-label="Evidence stage" disabled={locked} value={stage} onChange={e=>selectScope(e.target.value,allocation)}>{Object.entries(names).map(([key,label])=><option key={key} value={key} disabled={!open(key)}>{label}{!open(key)?' (not open)':''}</option>)}</select></label>
   {stage!=='placement'&&<label className="field"><span>Stage consignment</span><select aria-label="Stage consignment" required value={allocation} disabled={locked} onChange={e=>selectScope(stage,e.target.value)}><option value="">Choose consignment</option>{activeItems.map((item:Row)=><option key={item.id} value={item.id}>{item.snapshot.cn} · {item.snapshot.year}</option>)}</select></label>}
   <label className="field"><span>Upload stage file</span><input key={'file-'+fileKey} aria-label="Choose stage document" type="file" accept="application/pdf,image/png,image/jpeg" disabled={locked} onChange={e=>chooseFile(e.target.files?.[0]||null)}/></label>
   <label className="field"><span>Take stage photo</span><input key={'camera-'+fileKey} aria-label="Take stage document photo" type="file" accept="image/png,image/jpeg" capture="environment" disabled={locked} onChange={e=>chooseFile(e.target.files?.[0]||null)}/><small className="help">Camera availability depends on your device. You can also upload a saved photo.</small></label>
  </div>{file&&<p className="help">Selected: {file.name} · {Math.ceil(file.size/1024)} KB <button type="button" className="small" disabled={busy||saving} onClick={()=>{setFile(null);setUploadVersion(null);setFileKey(k=>k+1);}}>Remove stage selection</button></p>}
   {staleUpload&&<p role="status">This trip changed after the file was selected. <button type="button" className="small" disabled={locked||!open(stage)} onClick={()=>{setUploadVersion(snapshot!.version);setError('');}}>Use latest trip version for upload</button></p>}
   {file&&!open(stage)&&<p role="status">The selected stage is no longer open. Your file is retained; choose an open stage deliberately or remove the selection.</p>}
   <button className="small" disabled={locked||!!review||!file||!!staleUpload||!open(stage)||(stage!=='placement'&&!allocation)}>{saving?'Saving…':'Upload stage document'}</button>
  </form>}
  {review&&<form onSubmit={saveReview} aria-label="Review stage evidence"><h3>{review.kind==='correction'?'Correct stage review':'Review stage file'}</h3><p className="help">{selectedDocument?.name}. Owner review is not independent or provider verification.</p>
   {review.kind!=='correction'&&<label className="field"><span>Stage file decision</span><select aria-label="Stage file decision" disabled={busy||saving} value={review.kind} onChange={e=>setReview({...review,kind:e.target.value})}><option value="accept">Accept file</option><option value="reject">Reject file</option></select></label>}
   <label className="field"><span>Review actual time (IST)</span><input type="datetime-local" step="0.001" required disabled={busy||saving} value={review.eventAt} onChange={e=>setReview({...review,eventAt:e.target.value})}/></label>
   <label className="field"><span>Stage review reason{review.kind!=='accept'?' *':' (optional)'}</span><textarea aria-label="Stage review reason" required={review.kind!=='accept'} maxLength={500} disabled={busy||saving} value={review.note} onChange={e=>setReview({...review,note:e.target.value})}/></label>
   {!reviewCurrent&&<p role="status">This file’s stage or decision changed. Cancel this draft and review the current file history before making another decision.</p>}
   {review.version!==snapshot?.version&&<p role="status">The trip changed while this review was open. <button type="button" className="small" disabled={locked||!reviewCurrent} onClick={()=>setReview({...review,version:snapshot!.version})}>Use latest trip version for review</button></p>}
   <div className="inline"><button type="button" className="small" disabled={busy||saving} onClick={()=>setReview(null)}>Cancel stage review</button><button className="small" disabled={locked||!reviewCurrent||review.version!==snapshot?.version}>Save stage review</button></div>
  </form>}
  {snapshot?.documents.map(doc=>{const history=reviewsFor(doc.id),active=activeReview(doc.id);return <article key={doc.id} className="trip-exception"><div className="cell-stack"><strong>{names[doc.stage]} · {doc.allocation_id?detail.items.find((item:Row)=>item.id===doc.allocation_id)?.snapshot.cn:'Whole trip'} · {doc.name}</strong><span className="help">{active?(active.kind==='accept'?'Accepted manually':'Rejected manually'):'Awaiting owner review'} · uploaded {stamp(doc.created_at)} · {Math.ceil(doc.size/1024)} KB</span><a href={'/api/tms/stage-documents?assetId='+encodeURIComponent(doc.asset_id)}>Download private stage file</a><details><summary>Stage file review history ({history.length})</summary><p className="help">Uploaded by {doc.actor}.</p>{history.map(r=><p className="help" key={r.id}>{r.kind==='correction'?'Correction':r.kind==='accept'?'Accepted manually':'Rejected manually'} · actual {stamp(r.event_at)} · recorded {stamp(r.recorded_at)} · {r.actor}{r.note?' · '+r.note:''}</p>)}</details></div>{open(doc.stage)&&<button type="button" className="small" disabled={locked||!!review} aria-label={(active?'Correct stage review ':'Review stage file ')+doc.name} onClick={()=>startReview(doc)}>{active?'Correct review':'Review file'}</button>}</article>;})}
  {snapshot&&!snapshot.documents.length&&<p className="help">No private stage files uploaded.</p>}
 </details>;
}
