'use client';
import type {SupplierTruck,SupplierLane} from '@/lib/supplier-types';
import SupplierReviewDialog from './review-dialog';
export type SupplierDraftSwitch=({kind:'truck';next:SupplierTruck|null}|{kind:'route';next:SupplierLane|null})&{current:string};
export function supplierFormValues(form:HTMLFormElement){return JSON.stringify({values:Array.from(new FormData(form).entries()),badInput:Array.from(form.querySelectorAll('input')).map(input=>input.validity.badInput)});}
export default function SupplierDraftSwitchReview({choice,blocked,onKeep,onDiscard}:{choice:SupplierDraftSwitch;blocked:boolean;onKeep:()=>void;onDiscard:()=>void}){
 const destination=choice.kind==='truck'?(choice.next?.registration||'a new truck'):(choice.next?`${choice.next.origin} → ${choice.next.destination}`:'a new route');
 return <SupplierReviewDialog title={`Replace unfinished ${choice.kind} fields?`} description={`Continuing will discard the unfinished fields for ${choice.current} and open ${destination}. Your saved records change only when you save.`} keepLabel="Keep editing" confirmLabel="Discard fields & continue" blocked={blocked} onKeep={onKeep} onConfirm={onDiscard}><h3>{choice.current}</h3><p className="supplier-note">Keep editing to retain everything you have entered in this form.</p></SupplierReviewDialog>;
}
