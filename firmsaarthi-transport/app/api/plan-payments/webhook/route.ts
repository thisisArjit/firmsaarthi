import {env} from 'cloudflare:workers';
import {AppError,TransportService} from '@/lib/service';
import {BillingService} from '@/lib/billing';
import {PlanCheckout,checkoutConfig,type CheckoutEnvironment} from '@/lib/plan-checkout';
import {boundedBody} from '@/lib/request-body';
import {SitesBridge,type BridgeEnv} from '@/lib/sites-bridge';
export const dynamic='force-dynamic';
export async function POST(request:Request){
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  try{
    if(!env.DB)throw new AppError('Unavailable.',503);
    const raw=new TextDecoder().decode(await boundedBody(request,65536)),runtime=env as unknown as CheckoutEnvironment;
    const forwarded=await new SitesBridge(env as BridgeEnv).forwardWebhook(raw,request.headers.get('x-razorpay-signature'));
    if(forwarded)return Response.json(forwarded,{headers});
    const transport=new TransportService(env.DB,{userId:'razorpay-webhook',email:''});
    const result=await new PlanCheckout(transport,new BillingService(transport),checkoutConfig(runtime)).webhook(raw,request.headers.get('x-razorpay-signature'));
    return Response.json(result,{headers});
  }catch(e){return Response.json({error:e instanceof AppError?e.message:'Payment update is pending.'},{status:e instanceof AppError?e.status:503,headers});}
}
