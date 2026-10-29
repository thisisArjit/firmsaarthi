import {blockSupportAccess} from '@/lib/platform-service';
import { env } from 'cloudflare:workers';
import { AuthService, sameOrigin } from '@/lib/auth';
import { AppError, TransportService } from '@/lib/service';
import { BillingService } from '@/lib/billing';
import { boundedBody } from '@/lib/request-body';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
async function service(request:Request){if(!env.DB)throw new AppError('Database is unavailable.',503);const user=await new AuthService(env.DB).user(request.headers.get('cookie'));if(!user)throw new AppError('Sign in to continue.',401);return new BillingService(new TransportService(env.DB,user),(env as unknown as {BILLING_ADMIN_USER_ID?:string}).BILLING_ADMIN_USER_ID);}
function failure(e:unknown){const conflict=e instanceof Error&&/UNIQUE constraint/.test(e.message);return Response.json({error:conflict?'This payment reference is already recorded. Reload to check the subscription.':e instanceof Error?e.message:'Request failed.'},{status:conflict?409:e instanceof AppError?e.status:400,headers});}
export async function GET(request:Request){try{await blockSupportAccess(request);
  const url=new URL(request.url);
  if(url.searchParams.get('view')==='plan'){
    if(!env.DB)throw new AppError('Database is unavailable.',503);const plan=await new BillingService(new TransportService(env.DB,{userId:'',email:''})).policy();return Response.json({trialDays:plan.trial_days,monthlyAmount:plan.monthly_amount,yearlyAmount:plan.yearly_amount,teamMonthlyAmount:plan.team_monthly_amount,teamYearlyAmount:plan.team_yearly_amount},{headers});
  }
  const svc=await service(request);return Response.json(url.searchParams.get('view')==='admin'?await svc.adminState(url.searchParams.get('q')||''):await svc.state(),{headers});
}catch(e){return failure(e);}}
export async function POST(request:Request){try{await blockSupportAccess(request);
  const raw=new TextDecoder().decode(await boundedBody(request,8192));sameOrigin(request);const svc=await service(request),body=JSON.parse(raw);return Response.json(await svc.command(String(body.action),body.data||{}),{headers});
}catch(e){return failure(e);}}
