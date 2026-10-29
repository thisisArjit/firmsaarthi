'use client';
import { useState, type FormEvent } from 'react';
import { workspaceFetch } from '@/lib/workspace-sync';
import type { Row } from '@/lib/domain';
const stamp=(v:string)=>new Date(v).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'});
export default function TripDocumentsPanel({detail,busy,onSaved,onReview,onSaving}:{detail:Row;busy:boolean;onSaved:()=>Promise<void>;onReview:(doc:Row)=>void;onSaving:(saving:boolean)=>void}){
  const [file,setFile]=useState<File|null>(null),[allocation,setAllocation]=useState(''),[requestId,setRequestId]=useState(''),[version,setVersion]=useState<number|null>(null),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const eligible=detail.items.filter((a:Row)=>a.delivery&&a.pod?.kind!=='pod_accept');
  async function upload(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!file||!allocation)return;const formElement=e.currentTarget;setSaving(true);onSaving(true);setError('');
    try{const form=new FormData();form.set('file',file);form.set('tripId',detail.trip.id);form.set('allocationId',allocation);form.set('requestId',requestId);form.set('version',String(version));
      const r=await workspaceFetch('/api/tms/trip-documents',{method:'POST',body:form}),data=await r.json() as Row;if(!r.ok)throw new Error(data.error);
      setFile(null);setAllocation('');setVersion(null);formElement.reset();await onSaved();
    }catch(e){setError((e as Error).message);}finally{setSaving(false);onSaving(false);}
  }
  return <details className="optional-fields" open><summary>Private POD documents ({detail.documents.length})</summary>
    <p className="help">Owner-only files and review. Trip references and notes are visible to your team. Uploading does not accept POD. {detail.trip.pod_policy==='file_v1'?'This trip requires an accepted POD file for every consignment; a reference alone is not enough.':'This trip allows manual reference reviews or optional files.'} Do not upload identity or bank documents here.</p>
    {error&&<div className="alert error" role="alert"><p>{error} Your selected file is retained.</p><button type="button" className="small" disabled={saving} onClick={()=>{setVersion(detail.trip.version);setError('');}}>Use refreshed trip version</button></div>}
    {detail.status==='dispatched'&&eligible.length>0&&<form onSubmit={upload}><div className="form-grid">
      <label className="field"><span>Delivered consignment</span><select required disabled={saving||busy} value={allocation} onChange={e=>{setAllocation(e.target.value);setRequestId(crypto.randomUUID());setVersion(detail.trip.version);}}><option value="">Choose consignment</option>{eligible.map((a:Row)=><option key={a.id} value={a.id}>{a.snapshot.cn} · {a.snapshot.year}</option>)}</select></label>
      <label className="field"><span>POD file · PDF, PNG or JPEG · up to 2 MB</span><input required disabled={saving||busy} type="file" accept="application/pdf,image/png,image/jpeg" onChange={e=>{setFile(e.target.files?.[0]||null);setRequestId(crypto.randomUUID());setVersion(detail.trip.version);setError('');}}/></label>
    </div><button className="small" disabled={busy||saving||!file||!allocation}>{saving?'Uploading…':'Upload POD'}</button></form>}
    {detail.documents.map((doc:Row)=><article key={doc.id} className="trip-exception"><div className="cell-stack">
      <strong>{detail.items.find((a:Row)=>a.id===doc.allocation_id)?.snapshot.cn} · {doc.name}</strong>
      <span className="help">{doc.status} · uploaded {stamp(doc.created_at)} · {Math.ceil(doc.size/1024)} KB</span>
      {doc.review&&<span className="help">{doc.review.kind==='pod_reject'?'Reason: '+doc.review.note:doc.review.reference} · {stamp(doc.review.event_at)}</span>}
      <a href={'/api/tms?asset='+encodeURIComponent(doc.asset_id)}>Download private document</a>
      <details><summary>File and review history</summary><p className="help cell-text">SHA-256: {doc.sha256}<br/>Uploaded by: {doc.actor}</p>{doc.reviews.map((r:Row)=><p className="help" key={r.id}>{r.kind==='pod_accept'?'Accepted':'Rejected'} · {stamp(r.event_at)} · {r.actor} · {r.note||r.reference}{detail.corrected.includes(r.id)?' · Corrected':''}</p>)}</details>
    </div>{detail.status==='dispatched'&&!busy&&<button className="small" onClick={()=>onReview(doc)}>Review file</button>}</article>)}
    {!detail.documents.length&&<p className="help">No POD files uploaded. Existing reference-only history is unchanged.</p>}
  </details>;
}
