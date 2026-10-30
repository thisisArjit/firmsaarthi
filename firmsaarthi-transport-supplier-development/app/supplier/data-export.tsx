'use client';
import {useEffect,useRef,useState} from 'react';
import type {SupplierExportKind} from '@/lib/supplier-export-csv';
export default function SupplierDataExport({kind,owner,blocked=false}:{kind:SupplierExportKind;owner:boolean;blocked?:boolean}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const lock=useRef(false),request=useRef<AbortController|null>(null),objectUrl=useRef<string|null>(null),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;request.current?.abort();if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);};},[]);
  async function download(){if(lock.current||blocked||!owner)return;lock.current=true;setBusy(true);setError('');setNotice('');const current=new AbortController();request.current=current;try{
    const response=await fetch('/api/supplier-export?'+new URLSearchParams({kind}),{cache:'no-store',signal:current.signal});
    if(!response.ok){const body=await response.json().catch(()=>({})) as {error?:string};throw new Error(typeof body.error==='string'?body.error:'Unable to prepare the export. Try again.');}
    if(!response.headers.get('content-type')?.startsWith('text/csv'))throw new Error('The export could not be confirmed. Try again.');
    const blob=await response.blob();if(!mounted.current||current.signal.aborted)return;
    if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);const url=URL.createObjectURL(blob);objectUrl.current=url;
    const link=document.createElement('a');link.href=url;link.download=`firmsaarthi-supplier-${kind}.csv`;document.body.appendChild(link);link.click();link.remove();
    window.setTimeout(()=>{URL.revokeObjectURL(url);if(objectUrl.current===url)objectUrl.current=null;},1000);
    setNotice('CSV download requested. It contains saved details only.');
  }catch(e){if(mounted.current&&!current.signal.aborted)setError(e instanceof Error?e.message:'Unable to prepare the export.');}finally{lock.current=false;if(mounted.current)setBusy(false);}}
  return <section className="supplier-card" style={{marginTop:22}}><h2>{kind==='trucks'?'Private fleet export':'Saved routes export'}</h2><p className="supplier-note">{kind==='trucks'?'The fleet file contains private registration numbers. Choose carefully who you share it with. ':'Downloads your own workspace routes only. '}Exports include saved details; unfinished form edits are excluded. Formula-like text gets a “Text: ” prefix for spreadsheet viewing. These CSV files are not import templates.</p>{owner?<button className="supplier-btn secondary" type="button" disabled={busy||blocked} onClick={download}>{busy?'Preparing CSV…':kind==='trucks'?'Download fleet CSV':'Download routes CSV'}</button>:<p className="supplier-note">Only the workspace owner can download these saved records.</p>}{error&&<p className="supplier-status error" role="alert">{error}</p>}{notice&&<p className="supplier-note" role="status">{notice}</p>}</section>;
}
