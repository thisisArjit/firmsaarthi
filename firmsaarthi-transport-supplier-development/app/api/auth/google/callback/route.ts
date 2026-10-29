import { env } from 'cloudflare:workers';
import {supportToken} from '@/lib/platform-service';
import { sessionCookie } from '@/lib/auth';
import { GoogleAuth, googleConfig, flowBrowser, flowCookie } from '@/lib/google-auth';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  if(supportToken(request))return Response.redirect(new URL('/support',request.url),303);
  const config=googleConfig(env),base=config?new URL(config.redirectUri).origin:new URL(request.url).origin;
  let linking=false,supplier=false;
  const headers=new Headers({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});
  headers.append('Set-Cookie',flowCookie('',0));
  try{
    if(!config||!env.DB||new URL(request.url).origin!==base)throw new Error('Unavailable');
    const url=new URL(request.url),auth=new GoogleAuth(env.DB,config),flow=await auth.consume(url.searchParams.get('state')||'',flowBrowser(request.headers.get('cookie')));linking=flow.intent==='link';supplier=flow.business_kind==='supplier';
    if(url.searchParams.has('error'))throw new Error('Cancelled');
    const google=await auth.exchange(url.searchParams.get('code')||'',flow),token=await auth.complete(flow,google,request.headers.get('cookie'));
    headers.append('Set-Cookie',sessionCookie(token));headers.set('Location',base+(linking?'/account?google=linked':supplier?'/supplier':'/'));return new Response(null,{status:303,headers});
  }catch(error){
    const message=error instanceof Error?error.message:'';
    const code=message.includes('existing password')?'email-confirmation-required':message.includes('same email')?'email-mismatch':message.includes('No linked account')?'signup-required':'google-failed';
    headers.set('Location',base+(linking?'/account':supplier?'/supplier':'/')+'?auth='+code);return new Response(null,{status:303,headers});
  }
}
