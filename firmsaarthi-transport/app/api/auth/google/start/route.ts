import { env } from 'cloudflare:workers';
import {blockSupportAccess} from '@/lib/platform-service';
import { sameOrigin } from '@/lib/auth';
import { GoogleAuth, googleConfig, flowCookie } from '@/lib/google-auth';
import { AppError } from '@/lib/service';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
export async function POST(request:Request){try{
  await blockSupportAccess(request);
  if(Number(request.headers.get('content-length')||0)>8192)throw new AppError('Request too large.',413);
  const raw=await request.text();if(raw.length>8192)throw new AppError('Request too large.',413);sameOrigin(request);
  const config=googleConfig(env);if(!config||!env.DB)throw new AppError('Google sign-in is unavailable. Use your email and password.',503);
  if(new URL(request.url).origin!==new URL(config.redirectUri).origin)throw new AppError('Open FirmSaarthi at its main address to use Google sign-in.',400);
  const body=JSON.parse(raw),result=await new GoogleAuth(env.DB,config).start(body.intent,body.businessName,request.headers.get('cookie'),body.password,request.headers.get('cf-connecting-ip')||'local');
  return Response.json({url:result.url},{headers:{...headers,'Set-Cookie':flowCookie(result.browser)}});
}catch(error){return Response.json({error:error instanceof AppError?error.message:'Unable to start Google sign-in. Please try again.'},{status:error instanceof AppError?error.status:400,headers});}}
