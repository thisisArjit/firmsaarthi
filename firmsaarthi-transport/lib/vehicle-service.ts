import { AppError, type TransportService } from './service';
import { dateValue, required, type Row } from './domain';
import { vehicleRegistration } from './trip-domain';
import { SharedService } from './shared-service';
const now=()=>new Date().toISOString(),id=()=>crypto.randomUUID(),today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const vehicleDocumentKinds=['rc','insurance','fitness','permit','puc'] as const;
export class VehicleService {
  constructor(private s:TransportService){}
  async state():Promise<Row>{
    const s=this.s,m=await s.owner(),org=m.org_id;
    await new SharedService(s).vehicles(org);
    const [vehicles,documents,reviews,count]=await Promise.all([s.rows('SELECT * FROM trip_vehicles WHERE org_id=? ORDER BY registration',org),s.rows('SELECT d.* FROM vehicle_documents d WHERE d.org_id=? ORDER BY d.created_at DESC,d.rowid DESC LIMIT 1000',org),s.rows('SELECT r.* FROM vehicle_document_reviews r JOIN vehicle_documents d ON d.id=r.document_id AND d.org_id=r.org_id WHERE r.org_id=? ORDER BY r.created_at DESC,r.rowid DESC LIMIT 2000',org),s.first('SELECT COUNT(*) AS n FROM vehicle_documents WHERE org_id=?',org)]);
    const latest=new Map<string,Row>();for(const d of documents){d.details=JSON.parse(d.details);d.reviews=reviews.filter(r=>r.document_id===d.id);if(d.status==='recorded'&&!latest.has(d.vehicle_id+':'+d.kind))latest.set(d.vehicle_id+':'+d.kind,d);}
    return {vehicles,documents,latestDocuments:[...latest.values()],documentCount:count!.n,limit:1000,asOf:today()};
  }
  async command(action:string,d:Row):Promise<Row>{
    const s=this.s,m=await s.owner(),org=m.org_id;
    if(action==='vehicle.save'){
      const registration=vehicleRegistration(d.registration),vehicleId=id();await s.db.batch([s.statement('INSERT INTO trip_vehicles (id,org_id,registration,created_at) VALUES (?,?,?,?) ON CONFLICT(org_id,registration) DO NOTHING',vehicleId,org,registration,now()),s.audit(org,action,registration)]);return {success:true,id:(await s.first('SELECT id FROM trip_vehicles WHERE org_id=? AND registration=?',org,registration))!.id};
    }
    if(action==='vehicle.document.add'){
      const vehicle=await s.owned('trip_vehicles',String(d.vehicleId),org),kind=String(d.kind);if(!vehicleDocumentKinds.includes(kind as any))throw new AppError('Choose RC, insurance, fitness, permit or PUC.');
      const issued=d.issuedOn?dateValue(d.issuedOn):null,until=d.validUntil?dateValue(d.validUntil):null;if(issued&&issued>today())throw new AppError('Issue date cannot be in the future.');if(issued&&until&&until<issued)throw new AppError('Expiry cannot be before issue date.');
      const number=required(d.number,'Document number / reference',120),source=required(d.sourceReference,'Document source',300),key=required(d.requestId,'Request ID',80);if(!/^[a-zA-Z0-9-]{8,80}$/.test(key))throw new AppError('Invalid request ID.');
      const details:Row={};for(const field of ['manufacturer','model','vehicleClass','fuelType','emissionNorm','notes']){const value=String(d.details?.[field]||'').trim();if(value.length>(field==='notes'?500:100))throw new AppError('Document details are too long.');if(value)details[field]=value;}
      for(const field of ['grossWeightKg','payloadKg'])if(d.details?.[field]!==undefined&&d.details[field]!==''){const n=Number(d.details[field]);if(!Number.isFinite(n)||n<=0||n>200000)throw new AppError('Enter a supported weight in kilograms.');details[field]=n;}
      const assetId=d.assetId?String(d.assetId):null;if(assetId){await s.owned('assets',assetId,org);if(!await s.first("SELECT asset_id FROM asset_scopes WHERE asset_id=? AND org_id=? AND purpose='vehicle_document'",assetId,org))throw new AppError('Choose an authorized vehicle-document attachment.');}
      const documentId=`vehicle_doc_${org}_${key}`,old=await s.first('SELECT * FROM vehicle_documents WHERE id=? AND org_id=?',documentId,org),json=JSON.stringify(details);
      if(old){if(old.vehicle_id!==vehicle.id||old.kind!==kind||old.number!==number||old.issued_on!==issued||old.valid_until!==until||old.source_reference!==source||old.asset_id!==assetId||old.details!==json)throw new AppError('This request ID was used for different document details.',409);return {success:true,id:documentId,alreadyRecorded:true};}
      await s.db.batch([s.insert('vehicle_documents',{id:documentId,org_id:org,vehicle_id:vehicle.id,kind,number,issued_on:issued,valid_until:until,source_reference:source,asset_id:assetId,details:json,status:'recorded',version:1,created_by:s.user.userId,created_at:now()}),s.audit(org,action,documentId)]);return {success:true,id:documentId};
    }
    if(action==='vehicle.document.review'||action==='vehicle.document.void'){
      const doc=await s.owned('vehicle_documents',String(d.id),org);if(doc.status!=='recorded')throw new AppError('This document record is already voided.');const t=now(),auditId=id(),writes=[];
      if(action.endsWith('.review')){
        const method=String(d.method),checked=dateValue(d.checkedOn),reference=required(d.reference,'Review source / reference',300);if(!['document_review','official_manual_check'].includes(method))throw new AppError('Choose document review or an official manual check.');if(checked>today()||doc.issued_on&&checked<doc.issued_on)throw new AppError('Review date must be on/after issue and not in the future.');
        writes.push(s.statement("UPDATE vehicle_documents SET version=version+1 WHERE id=? AND org_id=? AND status='recorded' AND version=? RETURNING id",doc.id,org,Number(d.version)),s.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',auditId,org,s.user.userId,action,doc.id,t),s.statement('INSERT INTO vehicle_document_reviews (id,org_id,document_id,method,checked_on,reference,actor,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM audit WHERE id=? AND org_id=?)',id(),org,doc.id,method,checked,reference,s.user.userId,t,auditId,org));
      }else{const reason=required(d.reason,'Correction reason',500);writes.push(s.statement("UPDATE vehicle_documents SET status='void',version=version+1,voided_at=?,void_reason=? WHERE id=? AND org_id=? AND status='recorded' AND version=? RETURNING id",t,reason,doc.id,org,Number(d.version)),s.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',auditId,org,s.user.userId,action,doc.id,t));}
      const result=await s.db.batch(writes);if(!result[0].results?.length)throw new AppError('Document changed. Reload before reviewing or correcting.',409);return {success:true};
    }
    throw new AppError('Unknown vehicle action.',404);
  }
}
