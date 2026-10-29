import type { Row } from './domain';
import {consignmentStatusSql} from './consignment-status';
import { checkYear, dateValue, invoiceTotals, money, required, rateParts, weightValue } from './domain';
import { hashPassword, validatePassword } from './passwords';
import { categoryFor, companyPnl } from './finance';
import { normalizeEvent } from './transport-events';
import { StaffService } from './staff-service';
import { SupplierService } from './supplier-service';
import { AccountsService } from './accounts-service';
import { TripService } from './trip-service';
import { VehicleService } from './vehicle-service';
import { GpsService } from './gps-service';
import { SharedService } from './shared-service';
import { validateInvoiceTemplate } from './invoice-template';
import {validateInterestedCity} from './business-city';
import { BusinessService } from './business-service';
import { unscopedAsset } from './asset-access';

export type Identity = { userId: string; email: string };
export class AppError extends Error { constructor(message: string, public status = 400) { super(message); } }
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
export class TransportService {
  constructor(public db: D1Database, public user: Identity,public runtime:{gpsKey?:string;gpsFetch?:typeof fetch}={}) {}
  async first(sql: string, ...args: any[]): Promise<Row | null> { return this.db.prepare(sql).bind(...args).first(); }
  async rows(sql: string, ...args: any[]): Promise<Row[]> { return (await this.db.prepare(sql).bind(...args).all<Row>()).results; }
  statement(sql: string, ...args: any[]) { return this.db.prepare(sql).bind(...args); }
  async member() {
    const member = await this.first('SELECT * FROM memberships WHERE user_id = ?', this.user.userId);
    if (!member) throw new AppError('Create a workspace or accept a team invitation first.', 403);
    if(!['OWNER','MEMBER','DISPATCHER'].includes(member.role))throw new AppError('This account has no supported workspace access. Contact the workspace owner.',403);
    return member;
  }
  async owner() { const m = await this.member(); if (m.role !== 'OWNER') throw new AppError('Only the workspace owner can do this.', 403); return m; }
  async commercial(){const m=await this.member();if(m.role==='DISPATCHER')throw new AppError('Dispatcher access is limited to trip operations. Ask the workspace owner for other access.',403);return m;}
  audit(org: string, action: string, target: string) { return this.statement('INSERT INTO audit VALUES (?, ?, ?, ?, ?, ?)', id(), org, this.user.userId, action, target, now()); }
  async initialize() {
    let member = await this.first('SELECT * FROM memberships WHERE user_id = ?', this.user.userId);
    const pending = await this.rows('SELECT i.id, i.org_id, o.name FROM invitations i JOIN organizations o ON o.id = i.org_id WHERE lower(i.email) = lower(?)', this.user.email);
    return { user: this.user, member, pending };
  }
  async command(action: string, data: Row): Promise<Row> {
    const actor=await this.first('SELECT role FROM memberships WHERE user_id=?',this.user.userId);
    if(actor&&!['OWNER','MEMBER'].includes(actor.role)){await this.member();if(!['trip.create','trip.event'].includes(action))throw new AppError('Dispatcher access is limited to trip operations. Ask the workspace owner for other access.',403);}
    if(action.startsWith('vehicle.'))return new VehicleService(this).command(action,data);
    if(action.startsWith('business.'))return new BusinessService(this).command(action,data);
    if(action.startsWith('gps.'))return new GpsService(this,this.runtime.gpsKey,this.runtime.gpsFetch).command(action,data);
    if(action.startsWith('trip.'))return new TripService(this).command(action,data);
    if(action.startsWith('staff.'))return new StaffService(this).command(action,data);
    if(action.startsWith('supplier.'))return new SupplierService(this).command(action,data);
    if(action.startsWith('account.'))return new AccountsService(this).command(action,data);
    if(action==='workspace.ensure'){
      const current=await this.initialize();if(current.member||current.pending.length)return {success:true};
      const org=`org_${this.user.userId}`;const t=now();
      await this.db.batch([this.statement('INSERT OR IGNORE INTO organizations (id,owner_id,name,created_at) VALUES (?,?,?,?)',org,this.user.userId,'Transport Business',t),this.statement('INSERT OR IGNORE INTO memberships VALUES (?,?,?,?,?)',this.user.userId,org,this.user.email.toLowerCase(),'OWNER',t)]);return {success:true};
    }
    if (action === 'workspace.create') {
      const org = id(); const t = now();
      await this.db.batch([
        this.statement('INSERT INTO organizations (id, owner_id, name, created_at) VALUES (?, ?, ?, ?)', org, this.user.userId, required(data.name, 'Business name'), t),
        this.statement('INSERT INTO memberships VALUES (?, ?, ?, ?, ?)', this.user.userId, org, this.user.email.toLowerCase(), 'OWNER', t),
      ]);
      return { success: true };
    }
    if (action === 'invitation.accept') {
      if (await this.first('SELECT user_id FROM memberships WHERE user_id = ?', this.user.userId)) throw new AppError('Leave your current team before accepting an invitation.');
      const invite = await this.first('SELECT * FROM invitations WHERE id = ? AND lower(email) = lower(?)', data.id, this.user.email);
      if (!invite) throw new AppError('Invitation not found.',404);
      await this.db.batch([this.statement('INSERT INTO memberships VALUES (?, ?, ?, ?, ?)', this.user.userId, invite.org_id, this.user.email.toLowerCase(), 'MEMBER', now()), this.statement('DELETE FROM invitations WHERE id = ?', invite.id), this.audit(invite.org_id,'team.join',this.user.userId)]);
      return { success: true };
    }
    const m = await this.member(); const org = m.org_id;
    const year = data.year ? checkYear(data.year) : '';
    if(action.startsWith('receipt.')||action==='invoice.paid'||action==='invoice.reissue'||action==='invoice.delete')await this.initializeLegacyReceipts(org);
    if(action==='receipt.create'){
      const invoice=await this.owned('invoices',String(data.invoiceId),org),amount=money(data.amount),date=dateValue(data.date);
      if(amount<=0)throw new AppError('Receipt amount must be greater than zero.');
      if(date<invoice.date)throw new AppError('Receipt date cannot be before the invoice date; record earlier advances on the consignment.');
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());if(date>today)throw new AppError('Receipt date cannot be in the future.');
      if(!['bank','cash','upi'].includes(data.method))throw new AppError('Choose bank, cash or UPI.');
      const requestId=required(data.requestId,'Receipt request ID',80);if(!/^[a-zA-Z0-9-]{8,80}$/.test(requestId))throw new AppError('Invalid receipt request ID.');
      const receiptId=`receipt_${org}_${requestId}`,reference=String(data.reference||'').trim().slice(0,200);
      const existing=await this.first('SELECT * FROM invoice_receipts WHERE id=? AND org_id=?',receiptId,org);
      if(existing){if(existing.invoice_id!==invoice.id||existing.amount!==amount||existing.date!==date||existing.method!==data.method||existing.reference!==reference)throw new AppError('This receipt request was already used with different details.',409);return {success:true,id:receiptId,alreadyRecorded:true};}
      const result=await this.db.batch([
        this.statement(`INSERT INTO invoice_receipts (id,org_id,invoice_id,date,amount,method,reference,status,source,created_at) SELECT ?,?,?,?,?,?,?,'posted','manual',? WHERE ?<=(SELECT total-COALESCE((SELECT SUM(amount) FROM invoice_receipts WHERE invoice_id=? AND org_id=? AND status='posted'),0) FROM invoices WHERE id=? AND org_id=?) ON CONFLICT(id) DO NOTHING RETURNING id`,receiptId,org,invoice.id,date,amount,data.method,reference,now(),amount,invoice.id,org,invoice.id,org),
        this.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',id(),org,this.user.userId,action,receiptId,now()),
        this.statement("UPDATE invoices SET paid=CASE WHEN total<=(SELECT COALESCE(SUM(amount),0) FROM invoice_receipts WHERE invoice_id=? AND org_id=? AND status='posted') THEN 1 ELSE 0 END WHERE id=? AND org_id=?",invoice.id,org,invoice.id,org),
      ]);if(!result[0].results?.length){const saved=await this.first('SELECT * FROM invoice_receipts WHERE id=? AND org_id=?',receiptId,org);if(saved&&saved.invoice_id===invoice.id&&saved.amount===amount&&saved.date===date&&saved.method===data.method&&saved.reference===reference)return {success:true,id:receiptId,alreadyRecorded:true};throw new AppError('Receipt exceeds the remaining invoice balance or conflicts with another request. Refresh before trying again.',409);}return {success:true,id:receiptId};
    }
    if(action==='receipt.void'){
      await this.owner();const receipt=await this.owned('invoice_receipts',String(data.id),org);if(receipt.status!=='posted')throw new AppError('This receipt has already been voided.');
      const reason=required(data.reason,'Reason for voiding',500);await this.db.batch([this.statement("UPDATE invoice_receipts SET status='void',voided_at=?,void_reason=? WHERE id=? AND org_id=?",now(),reason,receipt.id,org),this.statement("UPDATE invoices SET paid=CASE WHEN total<=(SELECT COALESCE(SUM(amount),0) FROM invoice_receipts WHERE invoice_id=? AND org_id=? AND status='posted') THEN 1 ELSE 0 END WHERE id=? AND org_id=?",receipt.invoice_id,org,receipt.invoice_id,org),this.audit(org,action,receipt.id)]);return {success:true};
    }
    if(action==='integration.import'){
      await this.owner();if(!Array.isArray(data.rows)||data.rows.length<1||data.rows.length>250)throw new AppError('Import between 1 and 250 records.');
      const sourceReference=required(data.sourceReference,'Import source reference',200),kind=String(data.kind);
      const normalized=data.rows.map((r:Row)=>normalizeEvent(kind,r));const seen=new Map<string,Row>(),fresh:Row[]=[];
      for(const row of normalized){
        const key=JSON.stringify([row.kind,row.provider,row.external_id]);const duplicate=seen.get(key)||await this.first('SELECT * FROM transport_events WHERE org_id=? AND kind=? AND provider=? AND external_id=?',org,row.kind,row.provider,row.external_id);
        if(duplicate){if(duplicate.payload!==row.payload||duplicate.vehicle!==row.vehicle||duplicate.observed_at!==row.observed_at)throw new AppError('A source record ID already exists with different details. Correct the source instead of overwriting its history.',409);continue;}
        seen.set(key,row);fresh.push(row);
      }
      const t=now();const writes=fresh.map(row=>this.statement(`INSERT INTO transport_events (id,org_id,kind,provider,external_id,vehicle,observed_at,received_at,payload,source_reference,provenance) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(org_id,kind,provider,external_id) DO UPDATE SET payload=CASE WHEN transport_events.payload=excluded.payload AND transport_events.vehicle=excluded.vehicle AND transport_events.observed_at=excluded.observed_at THEN transport_events.payload ELSE NULL END`,id(),org,row.kind,row.provider,row.external_id,row.vehicle,row.observed_at,t,row.payload,sourceReference,'imported'));
      if(writes.length)await this.db.batch([...writes,this.audit(org,action,`${kind}: ${fresh.length} source records`)]);
      return {success:true,imported:fresh.length,duplicates:normalized.length-fresh.length};
    }
    if(action==='integration.prepare-expense'){
      await this.owner();checkYear(year);const event=await this.owned('transport_events',String(data.id),org),payload=JSON.parse(event.payload);
      if(event.kind!=='toll_transaction'||payload.direction!=='debit')throw new AppError('Only toll debits can become expense drafts. Refunds and wallet top-ups require separate reconciliation.');
      if(data.costResponsibility!=='company')throw new AppError('Confirm this toll is borne by your company and is not included in provider charges.');
      const date=dateValue(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(event.observed_at)),year);
      const source=`fastag:${event.provider}`,existing=await this.first('SELECT id FROM finance_entries WHERE org_id=? AND source=? AND external_id=?',org,source,event.external_id);
      if(existing)return {success:true,id:existing.id,alreadyPrepared:true};
      const entryId=id();await this.db.batch([this.statement(`INSERT INTO finance_entries (id,org_id,year,date,category,description,counterparty,reference,amount,recoverable_tax,paid_amount,consignment_id,status,version,source,external_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,0,?,NULL,'draft',1,?,?,?,?) ON CONFLICT(org_id,source,external_id) DO NOTHING`,entryId,org,year,date,'tolls',`FASTag toll: ${payload.plaza||event.vehicle}`,event.provider,event.external_id,payload.amount,payload.amount,source,event.external_id,now(),now()),this.audit(org,action,event.id)]);
      const saved=await this.first('SELECT id FROM finance_entries WHERE org_id=? AND source=? AND external_id=?',org,source,event.external_id);return {success:true,id:saved!.id};
    }
    if(action==='finance.save') {
      await this.owner();checkYear(year);
      const category=categoryFor(String(data.category));if(!category)throw new AppError('Choose a valid finance category.');
      const amount=money(data.amount),recoverableTax=money(data.recoverableTax),paidAmount=money(data.paidAmount);
      if(amount<=0)throw new AppError('Amount must be greater than zero.');
      if(paidAmount>amount+recoverableTax)throw new AppError('Payment cannot exceed the voucher total.');
      const linked=data.consignmentId?await this.owned('consignments',String(data.consignmentId),org):null;
      if(linked&&(linked.year!==year||category.group!=='direct'))throw new AppError('Only direct costs can link to a consignment in this financial year.');
      const row:Row={id:data.id||id(),org_id:org,year,date:dateValue(data.date,year),category:category.id,description:required(data.description,'Description',500),counterparty:String(data.counterparty||'').trim().slice(0,200),reference:String(data.reference||'').trim().slice(0,200),amount,recoverable_tax:recoverableTax,paid_amount:paidAmount,consignment_id:linked?.id||null,status:'draft',version:1,source:'manual',external_id:null,created_at:now(),updated_at:now()};
      if(data.id){
        const old=await this.owned('finance_entries',data.id,org);if(old.year!==year)throw new AppError('A voucher must stay in its original financial year.');if(old.status!=='draft')throw new AppError('Only draft vouchers can be edited. Void a posted voucher and create a replacement.');
        const fields=['date','category','description','counterparty','reference','amount','recoverable_tax','paid_amount','consignment_id','updated_at'];
        const result=await this.db.batch([this.statement(`UPDATE finance_entries SET ${fields.map(k=>`${k}=?`).join(',')},version=version+1 WHERE id=? AND org_id=? AND status='draft' AND version=? RETURNING id`,...fields.map(k=>row[k]),data.id,org,Number(data.version)),this.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',id(),org,this.user.userId,action,data.id,now())]);
        if(!result[0].results?.length)throw new AppError('This voucher changed. Refresh before editing.',409);
      }else await this.db.batch([this.insert('finance_entries',row),this.audit(org,action,row.id)]);
      return {success:true,id:row.id};
    }
    if(action==='finance.post'||action==='finance.void') {
      await this.owner();const old=await this.owned('finance_entries',data.id,org);
      if(old.source==='payroll')throw new AppError('Manage this staff expense through its payroll run.');
      const status=action==='finance.post'?'posted':'void';
      if(action==='finance.post'&&old.status!=='draft'||action==='finance.void'&&old.status==='void')throw new AppError('This voucher is not eligible for that action.');
      const result=await this.db.batch([this.statement('UPDATE finance_entries SET status=?,version=version+1,updated_at=? WHERE id=? AND org_id=? AND version=? AND status=? RETURNING id',status,now(),data.id,org,Number(data.version),old.status),this.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',id(),org,this.user.userId,action,data.id,now())]);
      if(!result[0].results?.length)throw new AppError('This voucher changed. Refresh before continuing.',409);
      return {success:true};
    }
    if (action === 'consignment.save') {
      const cn = this.consignment(data, org, year);
      if(!data.id)cn.stage_status='initiated';
      const vehicle=new SharedService(this).vehicleInsert(org,cn.truck),vehicleWrites=vehicle?[vehicle]:[];
      const duplicate = await this.first('SELECT id FROM consignments WHERE org_id=? AND year=? AND cn=? AND id<>? LIMIT 1',org,year,cn.cn,data.id||'');
      if(duplicate){const original=data.id?await this.owned('consignments',data.id,org):null;if(!original?.legacy_key||original.cn!==cn.cn||original.year!==year)throw new AppError('This consignment number already exists.');}
      if (data.id) {
        await this.owned('consignments', data.id, org);
        if (await this.first('SELECT * FROM invoice_items WHERE consignment_id = ?',data.id)) throw new AppError('This consignment is invoiced. Reissue or delete its invoice before editing.');
        const fields = Object.keys(cn).filter(k => !['id','org_id','created_at'].includes(k));
        await this.db.batch([this.statement(`UPDATE consignments SET ${fields.map(k=>`${k} = ?`).join(',')} WHERE id = ? AND org_id = ?`,...fields.map(k=>cn[k]),data.id,org),...vehicleWrites,this.audit(org,action,data.id)]);
      } else await this.db.batch([this.insert('consignments',cn),...vehicleWrites,this.audit(org,action,cn.id)]);
      return { success:true };
    }
    if (action === 'consignment.delete') {
      await this.owned('consignments',data.id,org);
      if(await this.first('SELECT id FROM trip_allocations WHERE org_id=? AND consignment_id=? LIMIT 1',org,data.id))throw new AppError('This consignment has trip history and cannot be deleted.');
      if(await this.first('SELECT id FROM supplier_payments WHERE org_id=? AND consignment_id=? LIMIT 1',org,data.id))throw new AppError('This consignment has supplier payment history and cannot be deleted.');
      if(await this.first('SELECT id FROM finance_entries WHERE org_id=? AND consignment_id=? LIMIT 1',org,data.id))throw new AppError('This consignment has finance history and cannot be deleted.');
      if (await this.first('SELECT * FROM invoice_items WHERE consignment_id = ?',data.id)) throw new AppError('Delete the linked invoice before deleting this consignment.');
      await this.db.batch([this.statement('DELETE FROM consignments WHERE id = ? AND org_id = ?',data.id,org),this.audit(org,action,data.id)]); return {success:true};
    }
    if (action === 'payments.save') {
      const old=await this.owned('consignments',data.id,org);if(old.settlement_initialized)throw new AppError('Use supplier settlement history to record payments and update provider costs.');
      const truck = money(data.truckFreight), charges = money(data.otherCharges), advance = money(data.advancePaid), balance = money(data.balancePaid);
      if (data.paymentDone && advance + balance < truck + charges) throw new AppError('The amount paid is below the provider cost. Clear Paid in full or enter the remaining payment.');
      const result=await this.db.batch([this.statement("UPDATE consignments SET provider=?,truck_freight=?,other_charges=?,advance_paid=?,balance_paid=?,advance_date=?,balance_date=?,payment_done=?,supplier_party_id=(SELECT party_id FROM party_aliases WHERE org_id=? AND kind='supplier' AND alias=?),provider_version=provider_version+1,updated_at=? WHERE id=? AND org_id=? AND settlement_initialized=0 AND provider_version=? RETURNING id",String(data.provider||'').trim(),truck,charges,advance,balance,data.advanceDate?dateValue(data.advanceDate):'',data.balanceDate?dateValue(data.balanceDate):'',data.paymentDone?1:0,org,String(data.provider||'').trim(),now(),data.id,org,old.provider_version),this.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',id(),org,this.user.userId,action,data.id,now())]);if(!result[0].results?.length)throw new AppError('Supplier details changed. Refresh and use settlement history.',409);return {success:true};
    }
    if (action === 'company.save') {
      const name = required(data.name,'Company name');
      const address=String(data.address||'').slice(0,2000),gst=String(data.gst||'').slice(0,30);
      await this.db.batch([
        this.statement('UPDATE companies SET address=?,gst=? WHERE id=(SELECT id FROM companies WHERE org_id=? AND name=? ORDER BY rowid LIMIT 1)',address,gst,org,name),
        this.statement('INSERT INTO companies (id,org_id,name,address,gst) SELECT ?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM companies WHERE org_id=? AND name=?)',id(),org,name,address,gst,org,name),
        this.audit(org,action,name)]);return {success:true};
    }
    if (action === 'profile.save') {
      await this.owner(); const profile:Row = {};
      for (const k of ['transportName','address','contactNumber','gst','acName','acNumber','bankName','ifscCode','swiftCode','logo','qr']) profile[k]=String(data[k]||'').slice(0,2000);
      const previous=await this.first('SELECT profile FROM organizations WHERE id=?',org);
      profile.interestedCity=validateInterestedCity(data.interestedCity===undefined?JSON.parse(previous?.profile||'{}').interestedCity:data.interestedCity);
      for (const k of ['logo','qr']) if (profile[k]) await unscopedAsset(this,profile[k],org);
      await this.db.batch([this.statement('UPDATE organizations SET name=?,profile=? WHERE id=?',required(profile.transportName,'Transport name'),JSON.stringify(profile),org),this.audit(org,action,org)]);return {success:true};
    }
    if (action === 'invoice.create' || action === 'invoice.reissue') return this.invoice(action,data,m);
    if (action === 'invoice.paid') {
      const invoice=await this.owned('invoices',data.id,org);
      if(await this.first("SELECT id FROM invoice_receipts WHERE invoice_id=? AND org_id=? AND source='manual' AND status='posted' LIMIT 1",invoice.id,org))throw new AppError('Use receipt history to adjust recorded payments.');
      const writes=[this.statement("UPDATE invoice_receipts SET status='void',voided_at=? WHERE invoice_id=? AND org_id=? AND status='posted'",now(),invoice.id,org)];
      if(data.paid)writes.push(this.statement("INSERT INTO invoice_receipts (id,org_id,invoice_id,date,amount,method,reference,status,source,created_at) VALUES (?,?,?,NULL,?,'legacy','Payment date not recorded','posted','legacy_flag',?)",id(),org,invoice.id,invoice.total,now()));
      await this.db.batch([...writes,this.statement('UPDATE invoices SET paid=? WHERE id=? AND org_id=?',data.paid?1:0,invoice.id,org),this.audit(org,action,data.id)]);return {success:true};
    }
    if (action === 'invoice.delete') {
      if(await this.first('SELECT id FROM invoice_terms_history WHERE invoice_id=? AND org_id=? LIMIT 1',data.id,org))throw new AppError('This invoice has agreed-terms history and cannot be deleted.');
      await this.owned('invoices',data.id,org);
      if(await this.first("SELECT id FROM invoice_receipts WHERE invoice_id=? AND org_id=? AND source='manual' LIMIT 1",data.id,org))throw new AppError('Invoices with recorded receipt history cannot be deleted.');
      await this.db.batch([this.statement('DELETE FROM invoices WHERE id=? AND org_id=?',data.id,org),this.audit(org,action,data.id)]);return {success:true};
    }
    if(action==='team.create') {
      await this.owner();const email=required(data.email,'Email',254).toLowerCase();
      const role=String(data.role||'DISPATCHER');if(!['MEMBER','DISPATCHER'].includes(role))throw new AppError('Choose Dispatcher or Commercial member access.');
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new AppError('Invalid email.');validatePassword(data.password);
      if(await this.first('SELECT user_id FROM password_accounts WHERE email=?',email))throw new AppError('An account with this email already exists.');
      const userId=id(),hash=await hashPassword(data.password),version=id(),t=now();
      await this.db.batch([this.statement('INSERT INTO password_accounts VALUES (?,?,?,?,0,?)',userId,email,hash,version,t),this.statement('INSERT INTO memberships VALUES (?,?,?,?,?)',userId,org,email,role,t),this.audit(org,action,JSON.stringify({userId,role}))]);return {success:true};
    }
    if(action==='team.role'){
      await this.owner();const role=String(data.role),expected=String(data.expectedRole);if(!['MEMBER','DISPATCHER'].includes(role)||!['MEMBER','DISPATCHER'].includes(expected))throw new AppError('Choose Dispatcher or Commercial member access.');
      const target=await this.first('SELECT user_id,role FROM memberships WHERE user_id=? AND org_id=?',data.id,org);if(!target||target.role==='OWNER')throw new AppError('Choose a non-owner team account in this workspace.',404);if(target.role!==expected)throw new AppError('Team access changed. Refresh before saving.',409);if(role===expected)return {success:true,unchanged:true};
      const auditId=id(),t=now(),result=await this.db.batch([this.statement("UPDATE memberships SET role=? WHERE user_id=? AND org_id=? AND role=? AND role<>'OWNER' RETURNING user_id",role,data.id,org,expected),this.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',auditId,org,this.user.userId,action,JSON.stringify({userId:data.id,from:expected,to:role}),t),this.statement('DELETE FROM auth_sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM audit WHERE id=? AND org_id=?)',data.id,auditId,org)]);if(!result[0].results?.length)throw new AppError('Team access changed. Refresh before saving.',409);return {success:true};
    }
    if(action==='team.password') {
      await this.owner();validatePassword(data.password);
      const target=await this.first("SELECT a.user_id FROM password_accounts a JOIN memberships m ON m.user_id=a.user_id WHERE m.org_id=? AND m.user_id=? AND m.role<>'OWNER' AND a.disabled=0",org,data.id);
      if(!target)throw new AppError('Team member not found.',404);
      const hash=await hashPassword(data.password);
      await this.db.batch([this.statement('UPDATE password_accounts SET password_hash=?,credential_version=?,updated_at=? WHERE user_id=?',hash,id(),now(),data.id),this.statement('DELETE FROM auth_sessions WHERE user_id=?',data.id),this.audit(org,action,data.id)]);return {success:true};
    }
    if (action === 'team.invite') {
      await this.owner();const email=required(data.email,'Email').toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new AppError('Invalid email.');
      await this.db.batch([this.statement('INSERT INTO invitations VALUES (?,?,?,?) ON CONFLICT(org_id,email) DO NOTHING',id(),org,email,now()),this.audit(org,action,email)]);return {success:true};
    }
    if (action === 'team.remove') {
      if(data.id!==this.user.userId) await this.owner();
      const target=await this.first('SELECT * FROM memberships WHERE user_id=? AND org_id=?',data.id,org);
      if(!target||target.role==='OWNER')throw new AppError('The workspace owner cannot be removed.');
      await this.db.batch([this.statement('UPDATE password_accounts SET disabled=1,credential_version=?,updated_at=? WHERE user_id=?',id(),now(),data.id),this.statement('DELETE FROM auth_sessions WHERE user_id=?',data.id),this.statement('DELETE FROM memberships WHERE user_id=? AND org_id=?',data.id,org),this.audit(org,action,data.id)]);return {success:true};
    }
    if(action==='team.revoke') {await this.owner();await this.db.batch([this.statement('DELETE FROM invitations WHERE id=? AND org_id=?',data.id,org),this.audit(org,action,data.id)]);return {success:true};}
    if(action==='import.consignments') {
      await this.owner();if(!Array.isArray(data.rows)||data.rows.length<1||data.rows.length>250)throw new AppError('Import between 1 and 250 rows per batch.');
      const rows=data.rows.map((r:Row)=>this.consignment(r,org,year));
      const shared=new SharedService(this),vehicles=rows.map((r:Row)=>shared.vehicleInsert(org,r.truck)).filter((q:D1PreparedStatement|null):q is D1PreparedStatement=>!!q);
      await this.db.batch([...rows.map((r:Row)=>this.insert('consignments',r)),...vehicles,this.audit(org,action,`${rows.length} rows`)]);return {success:true,count:rows.length};
    }
    throw new AppError('Unknown action.',404);
  }
  insert(table:string,row:Row) { const keys=Object.keys(row);return this.statement(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`,...keys.map(k=>row[k])); }
  async owned(table:string,key:string,org:string) {const row=await this.first(`SELECT * FROM ${table} WHERE id=? AND org_id=?`,key,org);if(!row)throw new AppError('Record not found.',404);return row;}
  consignment(d:Row,org:string,year:string):Row {
    checkYear(year); const freight=money(d.freight),advance=money(d.advance);
    if(advance>freight)throw new AppError('Customer advance cannot exceed freight.');
    const weight=weightValue(d.weight);
    if(!['Billed','To-pay'].includes(d.method||'Billed'))throw new AppError('Invalid payment method.');
    return {id:id(),org_id:org,year,cn:required(d.cn,'Consignment number',80),date:dateValue(d.date,year),company:required(d.company,'Company'),truck:required(d.truck,'Truck number',80),origin:required(d.origin,'From'),destination:required(d.destination,'To'),...rateParts(d.rate),weight,freight,advance,method:d.method||'Billed',created_at:now(),updated_at:now()};
  }
  async invoice(action:string,d:Row,m:Row) {
    const org=m.org_id;const year=checkYear(d.year);const old=action==='invoice.reissue'?await this.owned('invoices',d.id,org):null;
    if(old?.paid)throw new AppError('Mark the invoice unpaid before reissuing it.');
    if(old&&await this.first("SELECT id FROM invoice_receipts WHERE invoice_id=? AND org_id=? AND status='posted' LIMIT 1",old.id,org))throw new AppError('Void recorded receipts before reissuing an invoice.');
    const selected=Array.from(new Set<string>(d.ids||[]));if(!selected.length||selected.length>200)throw new AppError('Select between 1 and 200 consignments.');
    const items=await this.rows(`SELECT * FROM consignments WHERE org_id=? AND year=? AND id IN (${selected.map(()=>'?').join(',')})`,org,year,...selected);
    if(items.length!==selected.length||new Set(items.map(r=>r.company)).size!==1)throw new AppError('Select consignments from one company and financial year.');
    if(old&&(old.year!==year||old.company!==items[0].company))throw new AppError('A reissue must keep the original financial year and company.');
    const overrideMap=new Map((d.overrides||[]).map((r:Row)=>[r.id,r]));
    for(const r of items){const o=overrideMap.get(r.id) as Row|undefined;if(o){Object.assign(r,rateParts(o.rate));r.weight=weightValue(o.weight);r.freight=money(o.freight);r.advance=money(o.advance);if(r.advance>r.freight)throw new AppError('Invalid invoice line amounts.');}}
    const charges=(d.charges||[]).map((r:Row)=>({description:required(r.description,'Charge description'),cn:String(r.cn||''),date:r.date?dateValue(r.date):'',amount:money(r.amount)}));
    if(charges.length>50)throw new AppError('Too many other charges.');
    const totals=invoiceTotals(items,charges,d.taxMode||'none',d.paidBy||'');
    const business=await this.first('SELECT * FROM organizations WHERE id=?',org);const party=await this.first('SELECT * FROM companies WHERE org_id=? AND name=? ORDER BY rowid LIMIT 1',org,items[0].company);
    const references:Row={};for(const k of ['partyInvoiceNumber','partyInvoiceDate','workOrderNumber'])references[k]=String(d.references?.[k]||'').slice(0,200);
    const templateRow=await this.first('SELECT config FROM invoice_templates WHERE org_id=?',org),templateConfig=templateRow?JSON.parse(templateRow.config):null;
    const snapshot={template:templateConfig?validateInvoiceTemplate(templateConfig):null,...(!templateConfig?{defaultLayout:'stta-html-v1'}:{}),profile:JSON.parse(business!.profile),party:party||{name:items[0].company,address:'',gst:''},items,charges,totals,taxMode:d.taxMode||'none',paidBy:d.paidBy||'',references};
    const invoiceId=old?.id||id(),date=dateValue(d.date,year),json=JSON.stringify(snapshot),t=now();
    const queries:D1PreparedStatement[]=[];
    if(old){
      queries.push(this.statement('INSERT INTO invoice_revisions VALUES (?,?,?,?,?)',id(),old.id,old.snapshot,old.revision,t));
      queries.push(this.statement('UPDATE invoices SET date=?,total=?,snapshot=?,revision=revision+1 WHERE id=? AND org_id=? AND revision=?',date,totals.total,json,invoiceId,org,old.revision));
      queries.push(this.statement('DELETE FROM invoice_items WHERE invoice_id=?',invoiceId));
    }else{
      queries.push(this.statement('INSERT INTO invoice_sequences (org_id,year,next) VALUES (?,?,1) ON CONFLICT(org_id,year) DO UPDATE SET next=next+1',org,year));
      queries.push(this.statement("INSERT INTO invoices (id,org_id,year,number,date,company,total,snapshot,created_at,customer_party_id) SELECT ?,?,?,next,?,?,?,?,?,(SELECT party_id FROM party_aliases WHERE org_id=? AND kind='customer' AND alias=?) FROM invoice_sequences WHERE org_id=? AND year=?",invoiceId,org,year,date,items[0].company,totals.total,json,t,org,items[0].company,org,year));
    }
    for(const r of items){
      queries.push(this.statement('UPDATE consignments SET rate=?,rate_label=?,weight=?,freight=?,advance=?,updated_at=? WHERE id=? AND org_id=?',r.rate,r.rate_label||null,r.weight,r.freight,r.advance,t,r.id,org));
      queries.push(this.statement('INSERT INTO invoice_items VALUES (?,?)',invoiceId,r.id));
    }
    queries.push(this.audit(org,action,invoiceId));
    await this.db.batch(queries);return {success:true,id:invoiceId};
  }
  async state(year:string): Promise<Row> {
    checkYear(year);const init=await this.initialize();if(!init.member)return {...init,consignments:[],invoices:[],companies:[],team:[],invitations:[]};
    const m=init.member, org=m.org_id;
    await this.member();
    const shared=await new SharedService(this).state();
    if(m.role==='DISPATCHER'){
      const [business,consignments]=await Promise.all([this.first('SELECT id,name FROM organizations WHERE id=?',org),this.rows(`SELECT id,year,cn,date,company,truck,origin,destination,${consignmentStatusSql} AS stage_status,stage_version FROM consignments c WHERE org_id=? AND year=? ORDER BY date DESC,cn`,org,year)]);
      return {user:init.user,member:m,pending:[],business,consignments,invoices:[],companies:[],team:[],invitations:[],shared,access:{commercial:false,operations:true}};
    }
    await this.initializeLegacyReceipts(org);
    const [business,consignments,invoices,companies,team,invitations]=await Promise.all([
      this.first('SELECT * FROM organizations WHERE id=?',org),
      this.rows(`SELECT c.*,${consignmentStatusSql} AS display_stage_status,i.number AS invoice_number,i.id AS invoice_id,i.paid AS invoice_paid,CASE WHEN c.settlement_initialized=1 THEN COALESCE((SELECT SUM(amount) FROM supplier_payments p WHERE p.org_id=c.org_id AND p.consignment_id=c.id AND p.status='posted'),0) ELSE c.advance_paid+c.balance_paid END AS provider_total_paid FROM consignments c LEFT JOIN invoice_items x ON x.consignment_id=c.id LEFT JOIN invoices i ON i.id=x.invoice_id WHERE c.org_id=? AND c.year=? ORDER BY c.created_at DESC,c.rowid DESC`,org,year),
      this.rows("SELECT i.*,COALESCE((SELECT SUM(r.amount) FROM invoice_receipts r WHERE r.invoice_id=i.id AND r.org_id=i.org_id AND r.status='posted'),0) AS received_amount FROM invoices i WHERE i.org_id=? AND i.year=? ORDER BY i.number DESC",org,year),
      this.rows('SELECT * FROM companies WHERE org_id=? ORDER BY name',org),
      this.rows('SELECT user_id,email,role,joined_at FROM memberships WHERE org_id=?',org),
      m.role==='OWNER'?this.rows('SELECT * FROM invitations WHERE org_id=?',org):Promise.resolve([]),
    ]);
    return {...init,business:{...business,profile:JSON.parse(business!.profile)},consignments:consignments.map(c=>({...c,stage_status:c.display_stage_status})),invoices:invoices.map(r=>({...r,snapshot:JSON.parse(r.snapshot)})),companies,team,invitations,shared};
  }
  async backup() {
    const m=await this.owner();const org=m.org_id;
    const tripTables=['trip_documents','trip_document_reviews','subscriptions','subscription_grants','workspace_pod_policies'];
    await this.initializeLegacyReceipts(org);
    const tables=['organizations','companies','invoice_templates','business_leads','consignments','invoices','invitations','assets','audit','import_batches','finance_entries','transport_events','staff_employees','staff_salary_terms','staff_advances','staff_payruns','staff_payrun_lines','staff_salary_payments','supplier_payments','parties','party_aliases','invoice_terms_history','trip_vehicles','trips','trip_allocations','trip_events','asset_scopes','vehicle_documents','vehicle_document_reviews','gps_mappings','gps_observations'];const records:Row={};
    for(const table of [...tables,...tripTables])records[table]=await this.rows(`SELECT * FROM ${table} WHERE ${table==='organizations'?'id':'org_id'}=?`,org);
    records.subscriptions=records.subscriptions.map((row:Row)=>{const safe={...row};delete safe.exemption_reason;return safe;});
    records.gps_connections=await this.rows('SELECT id,org_id,provider,label,authorization_reference,status,version,last_attempt_at,last_success_at,last_error,created_at FROM gps_connections WHERE org_id=?',org);
    records.team=await this.rows('SELECT user_id,email,role,joined_at FROM memberships WHERE org_id=?',org);
    records.invoice_items=await this.rows('SELECT x.* FROM invoice_items x JOIN invoices i ON i.id=x.invoice_id WHERE i.org_id=?',org);
    records.invoice_revisions=await this.rows('SELECT r.* FROM invoice_revisions r JOIN invoices i ON i.id=r.invoice_id WHERE i.org_id=?',org);
    records.invoice_sequences=await this.rows('SELECT * FROM invoice_sequences WHERE org_id=?',org);
    records.invoice_receipts=await this.rows('SELECT * FROM invoice_receipts WHERE org_id=?',org);
    return {format:'tms-backup-v1',createdAt:now(),records};
  }
  async financeReport(year:string,from?:string,to?:string) {
    const m=await this.owner();checkYear(year);
    const start=dateValue(from||`${year.slice(0,4)}-04-01`,year),end=dateValue(to||`${year.slice(5)}-03-31`,year);
    if(start>end)throw new AppError('Start date must be on or before end date.');
    const [consignments,invoices,entries]=await Promise.all([
      this.rows('SELECT * FROM consignments WHERE org_id=? AND year=?',m.org_id,year),
      this.rows('SELECT * FROM invoices WHERE org_id=? AND year=?',m.org_id,year),
      this.rows('SELECT * FROM finance_entries WHERE org_id=? AND year=? ORDER BY date DESC,created_at DESC',m.org_id,year),
    ]);
    return {entries:entries.filter(r=>r.date>=start&&r.date<=end),report:companyPnl(consignments,invoices,entries,start,end)};
  }
  async integrationState():Promise<Row> {
    const m=await this.owner();const records=await this.rows('SELECT e.*,f.id AS finance_entry_id,f.status AS finance_status FROM transport_events e LEFT JOIN finance_entries f ON e.kind=\'toll_transaction\' AND f.org_id=e.org_id AND f.source=\'fastag:\'||e.provider AND f.external_id=e.external_id WHERE e.org_id=? ORDER BY e.observed_at DESC LIMIT 1000',m.org_id);
    const counts=await this.rows('SELECT kind,COUNT(*) count FROM transport_events WHERE org_id=? GROUP BY kind',m.org_id);
    return {records:records.map(r=>({...r,payload:JSON.parse(r.payload)})),counts,liveConnections:[],limit:1000};
  }
  async initializeLegacyReceipts(org:string){
    // Audited, idempotent compatibility backfill; deployment migrations stay schema-only.
    await this.db.batch([this.statement("INSERT OR IGNORE INTO invoice_receipts (id,org_id,invoice_id,date,amount,method,reference,status,source,created_at) SELECT 'legacy-paid-' || i.id,i.org_id,i.id,NULL,i.total,'legacy','Imported paid flag; payment date not recorded','posted','legacy_flag',? FROM invoices i WHERE i.org_id=? AND i.paid=1 AND NOT EXISTS(SELECT 1 FROM invoice_receipts r WHERE r.invoice_id=i.id AND r.org_id=i.org_id)",now(),org),this.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',id(),org,this.user.userId,'receipts.legacy-initialize',org,now())]);
  }
  async receiptHistory(invoiceId:string):Promise<Row>{const m=await this.commercial(),invoice=await this.owned('invoices',invoiceId,m.org_id);await this.initializeLegacyReceipts(m.org_id);const receipts=await this.rows('SELECT * FROM invoice_receipts WHERE org_id=? AND invoice_id=? ORDER BY created_at DESC',m.org_id,invoiceId),termsHistory=await this.rows('SELECT due_date,note,version,created_at FROM invoice_terms_history WHERE org_id=? AND invoice_id=? ORDER BY version DESC',m.org_id,invoiceId);const received=receipts.filter(r=>r.status==='posted').reduce((n,r)=>n+r.amount,0);return {invoice:{id:invoice.id,number:invoice.number,company:invoice.company,date:invoice.date,total:invoice.total,year:invoice.year,due_date:invoice.due_date,terms_version:invoice.terms_version},receipts,termsHistory,received,balance:invoice.total-received};}
}
