import { AppError, type TransportService } from './service';
import { dateValue, money, required, type Row } from './domain';
import { PayrollService } from './payroll-service';
const now=()=>new Date().toISOString();
export class StaffService {
  constructor(private svc:TransportService){}
  async command(action:string,data:Row):Promise<Row>{
    const svc=this.svc,m=await svc.owner(),org=m.org_id;
    if(/^staff\.(advance|payrun|payment)\./.test(action))return new PayrollService(svc).command(action,data);
    if(action==='staff.employee.save'){
      const joinedOn=dateValue(data.joinedOn),leftOn=data.leftOn?dateValue(data.leftOn):null;
      if(leftOn&&leftOn<joinedOn)throw new AppError('Leaving date cannot be before joining date.');
      const row={id:data.id||crypto.randomUUID(),org_id:org,code:required(data.code,'Employee code',40).toUpperCase(),name:required(data.name,'Employee name',150),designation:String(data.designation||'').trim().slice(0,150),branch:String(data.branch||'').trim().slice(0,150),joined_on:joinedOn,left_on:leftOn,version:1,created_at:now(),updated_at:now()};
      if(data.id){
        await svc.owned('staff_employees',data.id,org);
        const result=await svc.db.batch([svc.statement('UPDATE staff_employees SET code=?,name=?,designation=?,branch=?,joined_on=?,left_on=?,version=version+1,updated_at=? WHERE id=? AND org_id=? AND version=? RETURNING id',row.code,row.name,row.designation,row.branch,joinedOn,leftOn,now(),data.id,org,Number(data.version)),svc.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',crypto.randomUUID(),org,svc.user.userId,action,data.id,now())]);
        if(!result[0].results?.length)throw new AppError('This employee record changed. Refresh before editing.',409);
      }else await svc.db.batch([svc.insert('staff_employees',row),svc.audit(org,action,row.id)]);
      return {success:true,id:row.id};
    }
    if(action==='staff.salary.add'){
      const employee=await svc.owned('staff_employees',String(data.employeeId),org),effectiveFrom=dateValue(data.effectiveFrom),amount=money(data.monthlyAmount);
      if(!effectiveFrom.endsWith('-01'))throw new AppError('Salary terms take effect on the first day of a month. Partial-month payroll and arrears are separate calculations.');
      if(amount<=0)throw new AppError('Monthly salary must be greater than zero.');
      if(employee.left_on&&effectiveFrom>employee.left_on)throw new AppError('Salary terms cannot begin after the employee has left.');
      const recordId=crypto.randomUUID();await svc.db.batch([svc.insert('staff_salary_terms',{id:recordId,org_id:org,employee_id:employee.id,effective_from:effectiveFrom,monthly_amount:amount,note:String(data.note||'').trim().slice(0,500),created_at:now()}),svc.audit(org,action,recordId)]);return {success:true,id:recordId};
    }
    if(action==='staff.salary.void'){
      await svc.owned('staff_salary_terms',String(data.id),org);const reason=required(data.reason,'Correction reason',500);
      const result=await svc.db.batch([svc.statement('UPDATE staff_salary_terms SET voided_at=?,void_reason=? WHERE id=? AND org_id=? AND voided_at IS NULL RETURNING id',now(),reason,data.id,org),svc.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',crypto.randomUUID(),org,svc.user.userId,action,data.id,now())]);
      if(!result[0].results?.length)throw new AppError('This salary term was already voided.',409);return {success:true};
    }
    throw new AppError('Unknown staff action.',404);
  }
  async state(asOf:string):Promise<Row>{
    const svc=this.svc,m=await svc.owner(),date=dateValue(asOf);
    const [employees,terms]=await Promise.all([svc.rows('SELECT * FROM staff_employees WHERE org_id=? ORDER BY name,code',m.org_id),svc.rows('SELECT * FROM staff_salary_terms WHERE org_id=? ORDER BY effective_from DESC,created_at DESC',m.org_id)]);
    const rows=employees.map(r=>({...r,active_as_of:r.joined_on<=date&&(!r.left_on||r.left_on>=date),current_term:terms.find(t=>t.employee_id===r.id&&!t.voided_at&&t.effective_from<=date)||null}));
    return {asOf:date,employees:rows,terms,activeCount:rows.filter(r=>r.active_as_of).length,monthlyReference:rows.filter(r=>r.active_as_of).reduce((n,r)=>n+(r.current_term?.monthly_amount||0),0),missingSalaryCount:rows.filter(r=>r.active_as_of&&!r.current_term).length};
  }
}
