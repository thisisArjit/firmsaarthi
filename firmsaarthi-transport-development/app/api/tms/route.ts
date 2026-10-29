import {blockSupportAccess} from '@/lib/platform-service';
import { env } from 'cloudflare:workers';
import { AuthService } from '@/lib/auth';
import { AppError, TransportService } from '@/lib/service';
import { invoicePdf } from '@/lib/pdf';
import { StaffService } from '@/lib/staff-service';
import { PayrollService } from '@/lib/payroll-service';
import { SupplierService } from '@/lib/supplier-service';
import { AccountsService } from '@/lib/accounts-service';
import { TripService } from '@/lib/trip-service';
import { VehicleService } from '@/lib/vehicle-service';
import { GpsService } from '@/lib/gps-service';
import { CompaniesService } from '@/lib/companies-service';
import { BusinessService } from '@/lib/business-service';
import { downloadableAsset } from '@/lib/asset-access';
import { BillingService } from '@/lib/billing';
import { boundedBody } from '@/lib/request-body';
import { makePdf } from '@/lib/pdf';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
async function service(request:Request){if(!env.DB)throw new AppError('Database is unavailable.',503);const user=await new AuthService(env.DB).user(request.headers.get('cookie'));if(!user)throw new AppError('Sign in to continue.',401);const svc=new TransportService(env.DB,user,{gpsKey:(env as unknown as {GPS_CREDENTIAL_KEY?:string}).GPS_CREDENTIAL_KEY});if(!(request.method==='GET'&&new URL(request.url).searchParams.get('download')==='backup'&&Array.from(new URL(request.url).searchParams.keys()).length===1))await new BillingService(svc,(env as unknown as {BILLING_ADMIN_USER_ID?:string}).BILLING_ADMIN_USER_ID).requireAccess();return svc;}
function failure(error:unknown){const e=error as Error;const conflict=/UNIQUE constraint|FOREIGN KEY constraint/i.test(e.message);return Response.json({error:conflict?'This record conflicts with an existing record or another recent change. Refresh and try again.':e.message||'Request failed.'},{status:conflict?409:error instanceof AppError?error.status:400,headers});}
export async function GET(request:Request){try{await blockSupportAccess(request);
  const svc=await service(request),url=new URL(request.url),download=url.searchParams.get('download');
  if(url.searchParams.get('view')==='companies')return Response.json(await new CompaniesService(svc).state(url.searchParams.get('name')),{headers});
  if(url.searchParams.get('view')==='business')return Response.json(await new BusinessService(svc).state(),{headers});
  const access=await svc.member();if(access.role==='DISPATCHER'&&(download||url.searchParams.has('asset')||url.searchParams.has('report')||(url.searchParams.has('view')&&!['trips','trip'].includes(url.searchParams.get('view')||''))))throw new AppError('Dispatcher access is limited to trip operations.',403);
  if(url.searchParams.get('view')==='vehicles')return Response.json(await new VehicleService(svc).state(),{headers});
  if(url.searchParams.get('view')==='gps')return Response.json(await new GpsService(svc,svc.runtime.gpsKey).state(),{headers});
  if(url.searchParams.get('view')==='trips')return Response.json(await new TripService(svc).state(),{headers});
  if(url.searchParams.get('view')==='trip')return Response.json(await new TripService(svc).detail(url.searchParams.get('id')||''),{headers});
  if(url.searchParams.get('view')==='balances')return Response.json(await new AccountsService(svc).state(url.searchParams.get('kind')),{headers});
  if(url.searchParams.get('view')==='account-statement')return Response.json(await new AccountsService(svc).statement(url.searchParams.get('kind'),url.searchParams.get('key')||''),{headers});
  if(download==='account-balances'){
    const state=await new AccountsService(svc).statement(url.searchParams.get('kind'),url.searchParams.get('key')||''),amt=(n:number)=>(n/100).toFixed(2),g=state.group;
    const pdf=await makePdf(`${g.code||'Unlinked'} - ${g.name}`,['Document / year','Date','Due date','Charge INR','Paid INR','Remaining INR'],state.documents.map((d:any)=>[`${d.number} / ${d.year}`,d.date,d.due_date||'Unknown',amt(d.cost),amt(d.paid),amt(d.remaining)]),[`Current ${state.kind} document balances across all years as at ${state.asOf}.`,`Total charges INR ${amt(g.cost)}; recorded paid INR ${amt(g.paid)}.`,`Remaining INR ${amt(g.remaining)}; excess paid INR ${amt(g.excess)} (not offset automatically).`,'Management records; no bank verification. Download statement CSV for full payment history.']);
    return new Response(pdf as BodyInit,{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="Account-balances.pdf"'}});
  }
  if(url.searchParams.get('view')==='supplier-payments')return Response.json(await new SupplierService(svc).history(url.searchParams.get('id')||''),{headers});
  if(url.searchParams.get('view')==='payroll')return Response.json(await new PayrollService(svc).state(url.searchParams.get('period')||'',url.searchParams.get('runId')||undefined),{headers});
  if(download==='salary-statement'){
    const {line,run,paid}=await new PayrollService(svc).statement(url.searchParams.get('id')||''),currency=(n:number)=>`INR ${(n/100).toFixed(2)}`;
    const pdf=await makePdf('Salary statement',['Item','Amount / value'],[['Employee',line.snapshot.employee.name],['Employee code',line.snapshot.employee.code],['Payroll month',run.period],['Gross earnings',currency(line.gross)],['Employee deductions',currency(line.deductions)],['Advance recovery',currency(line.advance_recovery)],['Net salary',currency(line.net_pay)],['Recorded salary payments',currency(paid)],['Remaining salary payable',currency(line.net_pay-paid)],['Employer costs (separate)',currency(line.employer_cost)]],['Management statement from reviewed inputs; statutory calculations are not automated.','This statement does not initiate a bank transfer.']);
    return new Response(pdf as BodyInit,{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="Salary-${run.period}.pdf"`}});
  }
  if(url.searchParams.get('report')==='company-pnl')return Response.json(await svc.financeReport(url.searchParams.get('year')||'',url.searchParams.get('from')||undefined,url.searchParams.get('to')||undefined),{headers});
  if(url.searchParams.get('view')==='integrations')return Response.json(await svc.integrationState(),{headers});
  if(url.searchParams.get('view')==='receipts')return Response.json(await svc.receiptHistory(url.searchParams.get('id')||''),{headers});
  if(url.searchParams.get('view')==='staff')return Response.json(await new StaffService(svc).state(url.searchParams.get('asOf')||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())),{headers});
  if(download==='backup')return Response.json(await svc.backup(),{headers:{...headers,'Content-Disposition':'attachment; filename="tms-backup.json"'}});
  if(download==='invoice'){
    const m=await svc.member();const row=await svc.owned('invoices',url.searchParams.get('id')||'',m.org_id);row.snapshot=JSON.parse(row.snapshot);
    if(row.snapshot.legacyPdfAsset && row.revision===1){
      const original=await env.BUCKET?.get(`${m.org_id}/${row.snapshot.legacyPdfAsset}`);
      if(!original)throw new AppError('Archived original invoice PDF is unavailable.',503);
      return new Response(original.body,{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':`inline; filename="Invoice-${row.number}-${row.year}-original.pdf"`}});
    }
    const images:Record<string,Uint8Array>={};for(const name of ['logo','qr']){const key=row.snapshot.profile[name];if(key&&env.BUCKET){const object=await env.BUCKET.get(`${m.org_id}/${key}`);if(object)images[name]=new Uint8Array(await object.arrayBuffer());}}
    const pdf=await invoicePdf(row,images);return new Response(pdf as BodyInit,{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':`inline; filename="Invoice-${row.number}-${row.year}.pdf"`}});
  }
  const asset=url.searchParams.get('asset');if(asset){const {asset:row,org,privateDocument}=await downloadableAsset(svc,asset);const object=await env.BUCKET?.get(`${org}/${asset}`);if(!object)throw new AppError('File not found.',404);return new Response(object.body,{headers:{...headers,'Content-Type':row.mime,...(privateDocument?{'Content-Disposition':`attachment; filename="Private-document.${row.mime==='application/pdf'?'pdf':row.mime==='image/png'?'png':'jpg'}"`,'Content-Security-Policy':"sandbox; default-src 'none'"}:{})}});}
  return Response.json(await svc.state(url.searchParams.get('year')||''),{headers});
}catch(error){return failure(error);}}
export async function POST(request:Request){try{await blockSupportAccess(request);
  const multipart=request.headers.get('content-type')?.includes('multipart/form-data'),bodyBytes=await boundedBody(request,(multipart?3:2)*1024*1024);
  const origin=request.headers.get('origin');if(!origin||origin!==new URL(request.url).origin)throw new AppError('Cross-origin writes are blocked.',403);
  const svc=await service(request);
  if(multipart){
    const m=await svc.owner();const form=await new Response(bodyBytes,{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData();const file=form.get('file');
    const document=form.get('purpose')==='vehicle_document';
    if(form.get('purpose')&&!document)throw new AppError('Choose a supported upload purpose.');
    if(!(file instanceof File)||file.size>2*1024*1024||!(document?['image/png','image/jpeg','application/pdf']:['image/png','image/jpeg']).includes(file.type))throw new AppError(document?'Upload a PDF, PNG or JPEG up to 2 MB.':'Upload a PNG or JPEG up to 2 MB.');
    if(!env.BUCKET)throw new AppError('File storage is unavailable.',503);
    const bytes=new Uint8Array(await file.arrayBuffer());if(file.type==='image/png'&&!(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)||file.type==='image/jpeg'&&!(bytes[0]===255&&bytes[1]===216)||file.type==='application/pdf'&&new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw new AppError('The file does not match its type.');
    const id=crypto.randomUUID();await env.BUCKET.put(`${m.org_id}/${id}`,bytes,{httpMetadata:{contentType:file.type}});
    try{await svc.db.batch([svc.statement('INSERT INTO assets VALUES (?,?,?,?,?)',id,m.org_id,file.name.slice(0,200),file.type,new Date().toISOString()),...(document?[svc.statement('INSERT INTO asset_scopes VALUES (?,?,?)',id,m.org_id,'vehicle_document')]:[]),svc.audit(m.org_id,'asset.upload',id)]);}catch(e){await env.BUCKET.delete(`${m.org_id}/${id}`);throw e;}
    return Response.json({id},{headers});
  }
  const body=JSON.parse(new TextDecoder().decode(bodyBytes));
  if(body.action==='trip.event'&&bodyBytes.length>8192)throw new AppError('Trip event request too large.',413);
  if(/^(workspace\.|invitation\.|team\.(invite|revoke)$)/.test(String(body.action)))throw new AppError('Accounts are managed by the workspace owner in Your Team.',403);
  return Response.json(await svc.command(String(body.action),body.data||{}),{headers});
}catch(error){return failure(error);}}
