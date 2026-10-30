'use client';
import {useEffect,useRef,useState} from 'react';
export type SupplierRemoval={kind:'truck'|'route';id:string;label:string;details:string};
export default function SupplierRemovalReview({record,blocked,onKeep,onRemove}:{record:SupplierRemoval;blocked:boolean;onKeep:()=>void;onRemove:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),keep=useRef<HTMLButtonElement>(null),submitted=useRef(false),[unavailable,setUnavailable]=useState(false);
  useEffect(()=>{const element=dialog.current,previous=document.activeElement as HTMLElement|null;
    if(!element||typeof element.showModal!=='function'){setUnavailable(true);return;}
    try{element.showModal();keep.current?.focus();}catch{setUnavailable(true);return;}
    return()=>{if(element.open)element.close();if(previous?.isConnected)previous.focus();};
  },[]);
  if(unavailable)return <section className="supplier-status error" role="alert">Your browser could not open the removal review. The saved record has been kept. <button className="supplier-btn secondary" onClick={onKeep}>Keep record</button></section>;
  return <dialog ref={dialog} className="supplier-removal-dialog" aria-modal="true" aria-labelledby="supplier-removal-title" aria-describedby="supplier-removal-description" onCancel={e=>{e.preventDefault();onKeep();}} onKeyDown={e=>{if(e.key!=='Tab')return;const buttons=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])')),first=buttons[0],last=buttons.at(-1);if((e.shiftKey&&document.activeElement===first)||(!e.shiftKey&&document.activeElement===last)||!e.currentTarget.contains(document.activeElement)){e.preventDefault();(e.shiftKey?last:first)?.focus();}}}>
    <h2 id="supplier-removal-title">Remove this saved {record.kind}?</h2><h3>{record.label}</h3><p className="supplier-note">{record.details}</p>
    <p id="supplier-removal-description">This removes the saved {record.kind==='truck'?'truck from your supplier fleet':'preferred route'}. Your listing will be hidden until you review and publish again.</p>
    {record.kind==='truck'&&<p className="supplier-note">To keep the truck and stop advertising it, choose Not advertised in Edit truck instead.</p>}
    <p className="supplier-note">Unfinished form edits are kept. You can add the record again later; there is no undo action here.</p>
    <div className="supplier-actions"><button ref={keep} className="supplier-btn secondary" type="button" onClick={onKeep}>Keep {record.kind}</button><button className="supplier-btn danger" type="button" disabled={blocked} onClick={()=>{if(blocked||submitted.current)return;submitted.current=true;onRemove();}}>Remove saved {record.kind}</button></div>
  </dialog>;
}
