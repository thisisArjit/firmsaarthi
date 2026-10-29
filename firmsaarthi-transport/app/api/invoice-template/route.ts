import {blockSupportAccess} from '@/lib/platform-service';
import {env} from 'cloudflare:workers';
import {AuthService,sameOrigin} from '@/lib/auth';
import {AppError,TransportService} from '@/lib/service';
import {BillingService} from '@/lib/billing';
import {InvoiceTemplateService} from '@/lib/invoice-template-service';
import {validateInvoiceTemplate} from '@/lib/invoice-template';
import {invoicePdf} from '@/lib/pdf';
import {invoiceTotals} from '@/lib/domain';
import {boundedBody} from '@/lib/request-body';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
async function service(request:Request){if(!env.DB)throw new AppError('Database unavailable.',503);const user=await new AuthService(env.DB).user(request.headers.get('cookie'));if(!user)throw new AppError('Sign in to continue.',401);const s=new TransportService(env.DB,user);await s.owner();await new BillingService(s,(env as unknown as {BILLING_ADMIN_USER_ID?:string}).BILLING_ADMIN_USER_ID).requireAccess();return s;}
function failure(e:unknown){return Response.json({error:e instanceof Error?e.message:'Request failed.'},{status:e instanceof AppError?e.status:400,headers});}
export async function GET(request:Request){try{await blockSupportAccess(request);return Response.json(await new InvoiceTemplateService(await service(request)).state(),{headers});}catch(e){return failure(e);}}
export async function POST(request:Request){try{await blockSupportAccess(request);
  const raw=await boundedBody(request,16384);sameOrigin(request);const s=await service(request),body=JSON.parse(new TextDecoder().decode(raw)),templates=new InvoiceTemplateService(s);
  if(body.action==='save'||body.action==='reset')return Response.json(await templates.save(body.config,body.version,body.action==='reset'),{headers});
  if(body.action!=='preview')throw new AppError('Unknown template action.');
  const sampleDate=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}),template=body.config===null?null:validateInvoiceTemplate(body.config),m=await s.owner(),org=(await s.first('SELECT profile FROM organizations WHERE id=?',m.org_id))!,profile=JSON.parse(org.profile),items=[{cn:'SAMPLE-001',date:sampleDate,origin:'Sample pickup',destination:'Sample delivery',truck:'TEST12345',rate:100000,weight:'10',freight:1000000,advance:100000}],totals=invoiceTotals(items,[],'none','');
  const sample={year:'SAMPLE',number:'PREVIEW',revision:1,date:sampleDate,paid:0,snapshot:{profile,party:{name:'Sample customer - preview only',address:'Sample address',gst:''},items,charges:[],totals,references:{},paidBy:'',taxMode:'none',template,...(!template?{defaultLayout:'stta-html-v1'}:{})}},images:Record<string,Uint8Array>={};
  for(const key of ['logo','qr'])if(profile[key]&&env.BUCKET){const object=await env.BUCKET.get(m.org_id+'/'+profile[key]);if(object)images[key]=new Uint8Array(await object.arrayBuffer());}
  return new Response(await invoicePdf(sample,images) as BodyInit,{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':'inline; filename="Invoice-template-preview.pdf"'}});
}catch(e){return failure(e);}}
