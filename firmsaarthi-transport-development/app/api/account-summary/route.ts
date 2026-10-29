import {env} from 'cloudflare:workers';
import {AuthService} from '@/lib/auth';
import {AppError,TransportService} from '@/lib/service';
import {BillingService} from '@/lib/billing';
import {blockSupportAccess} from '@/lib/platform-service';
import {summaryFilters,loadRecordSummary} from '@/lib/record-summary';
import {recordSummaryFile} from '@/lib/record-summary-export';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export async function GET(request:Request){try{
 await blockSupportAccess(request);if(!env.DB)throw new AppError('Database unavailable.',503);
 const user=await new AuthService(env.DB).user(request.headers.get('cookie'));if(!user)throw new AppError('Sign in to continue.',401);
 const svc=new TransportService(env.DB,user);await svc.owner();await new BillingService(svc,(env as unknown as {BILLING_ADMIN_USER_ID?:string}).BILLING_ADMIN_USER_ID).requireAccess();
 const params=new URL(request.url).searchParams,input=summaryFilters(params),format=params.get('format');if(format&&!['csv','xlsx','pdf'].includes(format))throw new AppError('Choose CSV, Excel or PDF.');
 const report=await loadRecordSummary(svc,input);if(!format)return Response.json(report,{headers});
 if(report.rows.length>10000)throw new AppError('Choose a shorter date range before exporting.',413);
 const file=await recordSummaryFile(report,format);return new Response(file.bytes as BodyInit,{headers:{...headers,'Content-Type':file.type,'Content-Disposition':`attachment; filename="${input.kind}-summary-${input.year}.${format}"`}});
}catch(e){return Response.json({error:e instanceof Error?e.message:'Summary unavailable.'},{status:e instanceof AppError?e.status:400,headers});}}
