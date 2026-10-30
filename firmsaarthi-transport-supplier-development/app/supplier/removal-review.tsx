'use client';
import SupplierReviewDialog from './review-dialog';
export type SupplierRemoval={kind:'truck'|'route';id:string;label:string;details:string};
export default function SupplierRemovalReview({record,blocked,onKeep,onRemove}:{record:SupplierRemoval;blocked:boolean;onKeep:()=>void;onRemove:()=>void}){
  return <SupplierReviewDialog title={`Remove this saved ${record.kind}?`} description={`This removes the saved ${record.kind==='truck'?'truck from your supplier fleet':'preferred route'}. Your listing will be hidden until you review and publish again.`} keepLabel={`Keep ${record.kind}`} confirmLabel={`Remove saved ${record.kind}`} blocked={blocked} onKeep={onKeep} onConfirm={onRemove}>
    <h3>{record.label}</h3><p className="supplier-note">{record.details}</p>{record.kind==='truck'&&<p className="supplier-note">To keep the truck and stop advertising it, choose Not advertised in Edit truck instead.</p>}<p className="supplier-note">Unfinished form edits are kept. You can add the record again later; there is no undo action here.</p>
  </SupplierReviewDialog>;
}
