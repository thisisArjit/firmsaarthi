import { dateValue, money, type Row } from './domain';
export function payrollPeriod(value:unknown){
  const period=String(value||'');if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(period))throw new Error('Choose a payroll month in YYYY-MM format.');
  const [year,month]=period.split('-').map(Number),day=new Date(Date.UTC(year,month,0)).getUTCDate();return {period,start:`${period}-01`,end:`${period}-${day}`};
}
export function salaryAmounts(data:Row){
  const gross=money(data.gross),deductions=money(data.deductions),employerCost=money(data.employerCost),advanceRecovery=money(data.advanceRecovery);
  if(deductions+advanceRecovery>gross)throw new Error('Deductions and advance recovery cannot exceed gross earnings.');
  return {gross,deductions,employer_cost:employerCost,advance_recovery:advanceRecovery,net_pay:gross-deductions-advanceRecovery};
}
export function recordedPaymentDate(value:unknown){
  const date=dateValue(value),today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());if(date>today)throw new Error('An actual payment cannot be recorded in the future.');return date;
}
export function periodFinancialYear(end:string){const date=dateValue(end),year=Number(date.slice(0,4)),start=Number(date.slice(5,7))<4?year-1:year;return `${start}-${start+1}`;}
