import { AppError, type TransportService } from './service';
import { dateValue, money, required, type Row } from './domain';
import { recordedPaymentDate } from './payroll-domain';
const now=()=>new Date().toISOString(),id=()=>crypto.randomUUID();
export class SupplierService {
  constructor(private s:TransportService){}
  async initialize(consignmentId:string,org:string){
    const s=this.s;
    for(let attempt=0;attempt<3;attempt++){
      const c=await s.owned('consignments',consignmentId,org);if(c.settlement_initialized)return c;
      if(c.advance_paid<0||c.balance_paid<0)throw new AppError('Opening supplier totals contain a negative adjustment. Reconcile the original records before initializing payment history.');
      const auditId=id(),t=now(),legacy:Row[]=[];
      for(const [kind,amount,rawDate] of [['advance',c.advance_paid,c.advance_date],['payment',c.balance_paid,c.balance_date]] as [string,number,string][]){
        if(amount<=0)continue;let date:string|null=null;try{date=recordedPaymentDate(rawDate);}catch{};
        legacy.push({id:`supplier-opening-${kind}-${c.id}`,org_id:org,consignment_id:c.id,provider_snapshot:c.provider,kind,date,amount,method:'legacy',reference:`Opening ${kind==='advance'?'advance':'balance payment'} from existing totals; original date: ${rawDate||'not recorded'}`,source:'legacy_totals',status:'posted',created_at:t});
      }
      const writes=[s.statement('UPDATE consignments SET settlement_initialized=1,provider_version=provider_version+1 WHERE id=? AND org_id=? AND settlement_initialized=0 AND provider_version=? RETURNING id',c.id,org,c.provider_version),s.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',auditId,org,s.user.userId,'supplier.legacy-initialize',c.id,t),...legacy.map(row=>{const keys=Object.keys(row);return s.statement(`INSERT INTO supplier_payments (${keys.join(',')}) SELECT ${keys.map(()=>'?').join(',')} WHERE EXISTS(SELECT 1 FROM audit WHERE id=? AND org_id=?)`,...keys.map(k=>row[k]),auditId,org);})];
      const result=await s.db.batch(writes);if(result[0].results?.length)return s.owned('consignments',c.id,org);
    }
    throw new AppError('Supplier details changed. Refresh before continuing.',409);
  }
  async command(action:string,d:Row):Promise<Row>{
    const s=this.s,m=await s.owner(),org=m.org_id;
    if(action==='supplier.cost.save'){
      const c=await this.initialize(String(d.id),org),provider=String(d.provider||'').trim().slice(0,200),truck=money(d.truckFreight),charges=money(d.otherCharges),due=d.dueDate?dateValue(d.dueDate):null;
      if(truck+charges>0&&!provider)throw new AppError('Enter the truck provider before recording its cost.');
      const result=await s.db.batch([s.statement("UPDATE consignments SET provider=?,truck_freight=?,other_charges=?,provider_due_date=?,supplier_party_id=(SELECT party_id FROM party_aliases WHERE org_id=? AND kind='supplier' AND alias=?),provider_version=provider_version+1,updated_at=? WHERE id=? AND org_id=? AND provider_version=? RETURNING id",provider,truck,charges,due,org,provider,now(),c.id,org,Number(d.version)),s.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',id(),org,s.user.userId,action,c.id,now())]);
      if(!result[0].results?.length)throw new AppError('Supplier details or payments changed. Refresh before saving.',409);return {success:true};
    }
    if(action==='supplier.payment.create'){
      const c=await this.initialize(String(d.consignmentId),org),amount=money(d.amount),date=recordedPaymentDate(d.date),kind=String(d.kind),method=String(d.method),reference=required(d.reference,'Payment reference',200),requestId=required(d.requestId,'Request ID',80);
      if(!/^[a-zA-Z0-9-]{8,80}$/.test(requestId))throw new AppError('Invalid request ID.');
      if(amount<=0||!['advance','payment'].includes(kind)||!['bank','cash','upi'].includes(method))throw new AppError('Enter a positive supplier advance/payment and choose bank, cash or UPI.');
      const key=`supplier_${org}_${requestId}`,old=await s.first('SELECT * FROM supplier_payments WHERE id=? AND org_id=?',key,org);
      if(old){if(old.consignment_id!==c.id||old.amount!==amount||old.date!==date||old.kind!==kind||old.method!==method||old.reference!==reference)throw new AppError('This request ID was used with different supplier payment details.',409);return {success:true,id:key,alreadyRecorded:true};}
      await s.db.batch([s.insert('supplier_payments',{id:key,org_id:org,consignment_id:c.id,provider_snapshot:c.provider,kind,date,amount,method,reference,source:'manual',status:'posted',created_at:now()}),s.audit(org,action,key)]);return {success:true,id:key};
    }
    if(action==='supplier.payment.void'){
      const payment=await s.owned('supplier_payments',String(d.id),org),reason=required(d.reason,'Void reason',500);if(payment.status!=='posted')throw new AppError('This supplier payment is already voided.');
      const result=await s.db.batch([s.statement("UPDATE supplier_payments SET status='void',voided_at=?,void_reason=? WHERE id=? AND org_id=? AND status='posted' RETURNING id",now(),reason,payment.id,org),s.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',id(),org,s.user.userId,action,payment.id,now())]);if(!result[0].results?.length)throw new AppError('This payment record changed. Refresh before correcting it.',409);return {success:true};
    }
    throw new AppError('Unknown supplier action.',404);
  }
  async history(consignmentId:string):Promise<Row>{
    const s=this.s,m=await s.commercial(),c=await this.initialize(consignmentId,m.org_id),payments=await s.rows('SELECT * FROM supplier_payments WHERE org_id=? AND consignment_id=? ORDER BY created_at DESC,id',m.org_id,c.id),paid=payments.filter(r=>r.status==='posted').reduce((n,r)=>n+r.amount,0);
    return {consignment:c,payments,paid,cost:c.truck_freight+c.other_charges,remaining:Math.max(0,c.truck_freight+c.other_charges-paid),overpaid:Math.max(0,paid-c.truck_freight-c.other_charges),unknownDateCount:payments.filter(r=>r.status==='posted'&&!r.date).length};
  }
}
