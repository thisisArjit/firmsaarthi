import { AppError, type TransportService } from './service';
import { dateValue, money, required, type Row } from './domain';
import { payrollPeriod, salaryAmounts, recordedPaymentDate, periodFinancialYear } from './payroll-domain';
const now=()=>new Date().toISOString(),id=()=>crypto.randomUUID();
const requestKey=(value:unknown)=>{const key=required(value,'Request ID',80);if(!/^[a-zA-Z0-9-]{8,80}$/.test(key))throw new AppError('Invalid request ID.');return key;};
const paymentMethod=(value:unknown)=>{const method=String(value);if(!['bank','cash','upi'].includes(method))throw new AppError('Choose bank, cash or UPI.');return method;};
export class PayrollService{
  constructor(private svc:TransportService){}
  async command(action:string,d:Row):Promise<Row>{
    const s=this.svc,m=await s.owner(),org=m.org_id;
    if(action==='staff.advance.create'){
      const employee=await s.owned('staff_employees',String(d.employeeId),org),date=recordedPaymentDate(d.date),amount=money(d.amount),method=paymentMethod(d.method),kind=String(d.kind),reference=String(d.reference||'').trim().slice(0,200);
      if(!['advance','repayment'].includes(kind)||amount<=0)throw new AppError('Choose an advance or cash repayment with a positive amount.');
      if(kind==='advance'&&(date<employee.joined_on||employee.left_on&&date>employee.left_on))throw new AppError('An advance must fall within the recorded employment dates.');
      const key=`advance_${org}_${requestKey(d.requestId)}`,old=await s.first('SELECT * FROM staff_advances WHERE id=? AND org_id=?',key,org);
      if(old){if(old.employee_id!==employee.id||old.date!==date||old.amount!==amount||old.kind!==kind||old.method!==method||old.reference!==reference)throw new AppError('This request ID was used with different advance details.',409);return {success:true,id:key,alreadyRecorded:true};}
      await s.db.batch([s.insert('staff_advances',{id:key,org_id:org,employee_id:employee.id,date,kind,amount,method,reference,status:'posted',created_at:now()}),s.audit(org,action,key)]);return {success:true,id:key};
    }
    if(action==='staff.advance.void'){
      const row=await s.owned('staff_advances',String(d.id),org);if(row.status!=='posted')throw new AppError('Advance transaction is already voided.');
      const reason=required(d.reason,'Void reason',500);await s.db.batch([s.statement("UPDATE staff_advances SET status='void',voided_at=?,void_reason=? WHERE id=? AND org_id=?",now(),reason,row.id,org),s.audit(org,action,row.id)]);return {success:true};
    }
    if(action==='staff.payrun.create'){
      const p=payrollPeriod(d.period),employees=await s.rows('SELECT * FROM staff_employees WHERE org_id=? AND joined_on<=? AND (left_on IS NULL OR left_on>=?) ORDER BY code',org,p.end,p.start);
      if(!employees.length||employees.length>200)throw new AppError('A regular pay run needs between 1 and 200 employees in the month.');
      const terms=await s.rows('SELECT * FROM staff_salary_terms WHERE org_id=? AND voided_at IS NULL AND effective_from<=? ORDER BY effective_from DESC',org,p.start),runId=id(),rows:Row[]=[];
      for(const employee of employees){const term=terms.find(t=>t.employee_id===employee.id);if(!term)throw new AppError(`Add an applicable salary term for ${employee.code} before preparing this month.`);
        rows.push({id:id(),org_id:org,payrun_id:runId,employee_id:employee.id,snapshot:JSON.stringify({employee,term,referenceOnly:true}),gross:term.monthly_amount,deductions:0,employer_cost:0,advance_recovery:0,net_pay:term.monthly_amount,reviewed:0,note:''});
      }
      await s.db.batch([s.insert('staff_payruns',{id:runId,org_id:org,period:p.period,period_end:p.end,status:'draft',version:1,created_at:now()}),...rows.map(r=>s.insert('staff_payrun_lines',r)),s.audit(org,action,runId)]);return {success:true,id:runId};
    }
    if(action==='staff.payrun.line.save'){
      const line=await s.owned('staff_payrun_lines',String(d.id),org),run=await s.owned('staff_payruns',line.payrun_id,org),amounts=salaryAmounts(d);
      if(run.status!=='draft')throw new AppError('Only a draft pay run can be edited.');
      const result=await s.db.batch([s.statement("UPDATE staff_payrun_lines SET gross=?,deductions=?,employer_cost=?,advance_recovery=?,net_pay=?,reviewed=?,note=? WHERE id=? AND org_id=? AND EXISTS(SELECT 1 FROM staff_payruns WHERE id=? AND org_id=? AND status='draft' AND version=?) RETURNING id",amounts.gross,amounts.deductions,amounts.employer_cost,amounts.advance_recovery,amounts.net_pay,d.reviewed===true?1:0,String(d.note||'').trim().slice(0,500),line.id,org,run.id,org,Number(d.version)),s.statement('UPDATE staff_payruns SET version=version+1 WHERE id=? AND org_id=? AND version=? AND changes()>0',run.id,org,Number(d.version)),s.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',id(),org,s.user.userId,action,line.id,now())]);
      if(!result[0].results?.length)throw new AppError('This pay run changed. Refresh before reviewing the line.',409);return {success:true};
    }
    if(action==='staff.payrun.post'){
      const run=await s.owned('staff_payruns',String(d.id),org);if(run.status==='posted')return {success:true,id:run.id,alreadyPosted:true};if(run.status!=='draft')throw new AppError('Only a draft pay run can be posted.');
      if(Number(d.version)!==run.version)throw new AppError('This pay run changed. Refresh before posting.',409);
      const p=payrollPeriod(run.period);if(p.period>=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).slice(0,7))throw new AppError('Only completed payroll months can be posted. Keep this month in draft until it closes.');
      const lines=await s.rows('SELECT * FROM staff_payrun_lines WHERE org_id=? AND payrun_id=?',org,run.id);if(!lines.length||lines.some(r=>!r.reviewed))throw new AppError('Review every employee line before posting payroll.');
      const overlapping=await s.rows("SELECT id FROM finance_entries WHERE org_id=? AND category='staff' AND status='posted' AND source<>'payroll' AND date>=? AND date<=?",org,p.start,p.end);
      if(overlapping.length&&d.existingCostsReviewed!==true)throw new AppError('This month has existing staff expense vouchers. Check that they do not duplicate this payroll, or void the duplicate vouchers first.');
      const financeId=id(),cost=lines.reduce((n,r)=>n+r.gross+r.employer_cost,0),t=now();
      const result=await s.db.batch([
        s.statement("INSERT INTO finance_entries (id,org_id,year,date,category,description,counterparty,reference,amount,recoverable_tax,paid_amount,status,version,source,external_id,created_at,updated_at) SELECT ?,?,?,?,'staff',?,'Staff payroll',?,?,0,0,'posted',1,'payroll',?,?,? FROM staff_payruns WHERE id=? AND org_id=? AND status='draft' AND version=?",financeId,org,periodFinancialYear(p.end),p.end,`Payroll ${p.period}`,p.period,cost,run.id,t,t,run.id,org,Number(d.version)),
        s.statement("UPDATE staff_payruns SET status='posted',version=version+1,finance_entry_id=?,posted_at=?,approved_by=? WHERE id=? AND org_id=? AND status='draft' AND version=? AND EXISTS(SELECT 1 FROM finance_entries WHERE id=? AND org_id=?) RETURNING id",financeId,t,s.user.userId,run.id,org,Number(d.version),financeId,org),
        s.statement("INSERT INTO audit SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM staff_payruns WHERE id=? AND org_id=? AND finance_entry_id=?)",id(),org,s.user.userId,action,run.id,t,run.id,org,financeId),
      ]);if(!result[1].results?.length)throw new AppError('This pay run changed. Refresh before posting.',409);return {success:true,id:run.id};
    }
    if(action==='staff.payrun.void'){
      const run=await s.owned('staff_payruns',String(d.id),org);if(run.status==='void')throw new AppError('This pay run is already voided.');const reason=required(d.reason,'Void reason',500),t=now(),auditId=id();
      if(Number(d.version)!==run.version)throw new AppError('This pay run changed. Refresh before voiding.',409);
      const result=await s.db.batch([s.statement("UPDATE staff_payruns SET status='void',voided_at=?,void_reason=?,version=version+1 WHERE id=? AND org_id=? AND version=? RETURNING id",t,reason,run.id,org,Number(d.version)),s.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',auditId,org,s.user.userId,action,run.id,t),s.statement("UPDATE finance_entries SET status='void',version=version+1,updated_at=? WHERE id=? AND org_id=? AND source='payroll' AND external_id=? AND EXISTS(SELECT 1 FROM audit WHERE id=? AND org_id=?)",t,run.finance_entry_id||'',org,run.id,auditId,org)]);
      if(!result[0].results?.length)throw new AppError('This pay run changed. Refresh before voiding.',409);return {success:true};
    }
    if(action==='staff.payment.create'){
      const line=await s.owned('staff_payrun_lines',String(d.lineId),org),run=await s.owned('staff_payruns',line.payrun_id,org),amount=money(d.amount),date=recordedPaymentDate(d.date),method=paymentMethod(d.method),reference=required(d.reference,'Payment reference',200),key=`salary_${org}_${requestKey(d.requestId)}`;
      if(run.status!=='posted')throw new AppError('Post the pay run before recording its salary payment.');if(date<`${run.period}-01`||amount<=0)throw new AppError('Use a positive payment in or after the payroll month.');
      const existing=await s.first('SELECT * FROM staff_salary_payments WHERE id=? AND org_id=?',key,org);if(existing){if(existing.line_id!==line.id||existing.amount!==amount||existing.date!==date||existing.method!==method||existing.reference!==reference)throw new AppError('This request ID was used with different payment details.',409);return {success:true,id:key,alreadyRecorded:true};}
      await s.db.batch([s.insert('staff_salary_payments',{id:key,org_id:org,line_id:line.id,date,amount,method,reference,status:'posted',created_at:now()}),s.audit(org,action,key)]);return {success:true,id:key};
    }
    if(action==='staff.payment.void'){
      const row=await s.owned('staff_salary_payments',String(d.id),org);if(row.status!=='posted')throw new AppError('This salary payment is already voided.');await s.db.batch([s.statement("UPDATE staff_salary_payments SET status='void',voided_at=?,void_reason=? WHERE id=? AND org_id=?",now(),required(d.reason,'Void reason',500),row.id,org),s.audit(org,action,row.id)]);return {success:true};
    }
    throw new AppError('Unknown payroll action.',404);
  }
  async state(period:string,selectedRunId?:string):Promise<Row>{
    const s=this.svc,m=await s.owner(),p=payrollPeriod(period),org=m.org_id;
    const [employees,runs,advances,movements,manualVouchers]=await Promise.all([
      s.rows('SELECT * FROM staff_employees WHERE org_id=? ORDER BY name',org),s.rows('SELECT * FROM staff_payruns WHERE org_id=? AND period=? ORDER BY created_at DESC',org,p.period),
      s.rows('SELECT a.*,e.name,e.code FROM staff_advances a JOIN staff_employees e ON e.id=a.employee_id AND e.org_id=a.org_id WHERE a.org_id=? ORDER BY a.date DESC,a.created_at DESC',org),
      s.rows('SELECT * FROM staff_advance_ledger WHERE org_id=? ORDER BY date,id',org),s.rows("SELECT id,date,description,amount FROM finance_entries WHERE org_id=? AND category='staff' AND status='posted' AND source<>'payroll' AND date>=? AND date<=?",org,p.start,p.end),
    ]);
    const activeRun=runs.find(r=>r.status!=='void')||null,run=selectedRunId?runs.find(r=>r.id===selectedRunId):activeRun;
    if(selectedRunId&&!run)throw new AppError('Pay run not found in this month.',404);
    const lines=run?await s.rows("SELECT l.*,COALESCE((SELECT SUM(amount) FROM staff_salary_payments x WHERE x.org_id=l.org_id AND x.line_id=l.id AND x.status='posted'),0) AS paid_amount FROM staff_payrun_lines l WHERE l.org_id=? AND l.payrun_id=? ORDER BY l.rowid",org,run.id):[];
    const payments=run?await s.rows('SELECT p.* FROM staff_salary_payments p JOIN staff_payrun_lines l ON l.id=p.line_id AND l.org_id=p.org_id WHERE p.org_id=? AND l.payrun_id=? ORDER BY p.date DESC,p.created_at DESC',org,run.id):[];
    const balances=employees.map(e=>({...e,balance:movements.filter(r=>r.employee_id===e.id).reduce((n,r)=>n+r.delta,0),balanceAtPeriodEnd:movements.filter(r=>r.employee_id===e.id&&r.date<=p.end).reduce((n,r)=>n+r.delta,0)}));
    return {period:p.period,periodEnd:p.end,employees:balances,run:run||null,activeRunId:activeRun?.id||null,runs,lines:lines.map(r=>({...r,snapshot:JSON.parse(r.snapshot)})),payments,advances,movements,manualVouchers};
  }
  async statement(lineId:string):Promise<Row>{const s=this.svc,m=await s.owner(),line=await s.owned('staff_payrun_lines',lineId,m.org_id),run=await s.owned('staff_payruns',line.payrun_id,m.org_id);if(run.status!=='posted')throw new AppError('Salary statements are available for posted payroll only.');const payments=await s.rows("SELECT * FROM staff_salary_payments WHERE org_id=? AND line_id=? AND status='posted'",m.org_id,line.id);return {line:{...line,snapshot:JSON.parse(line.snapshot)},run,paid:payments.reduce((n,r)=>n+r.amount,0)};}
}
