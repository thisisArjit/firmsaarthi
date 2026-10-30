import type {SupplierDraft} from './supplier-types';
import {supplierAvailabilityLabel} from './supplier-readiness';
export type SupplierExportKind='trucks'|'routes';
// These files are for human spreadsheet viewing, not round-trip import. A plain
// text marker avoids relying only on quote/tab escapes which some spreadsheet
// applications remove on resave. Always quote fields and double embedded quotes.
export function supplierCsvCell(value:unknown){
  let text=String(value??'');
  if(/^[\s\p{Cf}]*[=+\-@＝＋－＠]/u.test(text)||/^[\u0000-\u001f\u007f]/.test(text))text='Text: '+text;
  return '"'+text.replaceAll('"','""')+'"';
}
export function supplierCsv(draft:SupplierDraft,kind:SupplierExportKind,at:Date){
  if(!Array.isArray(draft.trucks)||!Array.isArray(draft.routes)||draft.trucks.length>100||draft.routes.length>100)throw new Error('Unsupported saved supplier listing.');
  const asOf=at.toISOString(),headers=kind==='trucks'?['Private registration','Truck type','Payload (tonnes)','Relationship (self-declared)','Saved availability','Availability as of export (self-reported)','Current city (self-reported)','Available until (India date)','Exported at (UTC)']:['Origin city','Destination city','Truck type','Return route included','Source','Exported at (UTC)'];
  const rows=kind==='trucks'?draft.trucks.map(t=>[t.registration,t.type,t.capacity,t.relationship,t.status,supplierAvailabilityLabel(t,at.getTime()),t.city,t.availableUntil,asOf]):draft.routes.map(r=>[r.origin,r.destination,r.type,r.returnRoute?'Yes':'No','Self-reported preferred route',asOf]);
  return {filename:`firmsaarthi-supplier-${kind}.csv`,asOf,count:rows.length,content:'\uFEFF'+[headers,...rows].map(row=>row.map(supplierCsvCell).join(',')).join('\r\n')+'\r\n'};
}
