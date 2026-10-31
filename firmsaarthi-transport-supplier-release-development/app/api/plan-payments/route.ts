import {env} from 'cloudflare:workers';
import {AuthService,sameOrigin} from '@/lib/auth';
import {AppError,TransportService} from '@/lib/service';
import {BillingService} from '@/lib/billing';
import {PlanCheckout,checkoutConfig,type CheckoutEnvironment} from '@/lib/plan-checkout';
import {blockSupportAccess} from '@/lib/platform-service';
import {boundedBody} from '@/lib/request-body';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
async function service(request:Request){
  await blockSupportAccess(request);if(!env.DB)throw new AppError('Database is unavailable.',503);
  const user=await new AuthService(env.DB).user(request.headers.get('cookie'));if(!user)throw new AppError('Sign in to continue.',401);
  const transport=new TransportService(env.DB,user),runtime=env as unknown as CheckoutEnvironment&{BILLING_ADMIN_USER_ID?:string};
  return new PlanCheckout(transport,new BillingService(transport,runtime.BILLING_ADMIN_USER_ID),checkoutConfig(runtime));
}
function failure(e:unknown){return Response.json({error:e instanceof AppError?e.message:'Payment confirmation could not be completed. Check payment status before trying again.'},{status:e instanceof AppError?e.status:503,headers});}
export async function GET(request:Request){try{return Response.json(await(await service(request)).state(),{headers});}catch(e){return failure(e);}}
export async function POST(request:Request){try{
  const svc=await service(request);sameOrigin(request);const data=JSON.parse(new TextDecoder().decode(await boundedBody(request,8192)));
  const result=data.action==='create'?await svc.create(data):data.action==='verify'?await svc.verify(data):data.action==='refresh'?await svc.refresh(data.id):(()=>{throw new AppError('Unsupported payment request.');})();
  return Response.json(result,{headers});
}catch(e){return failure(e);}}
