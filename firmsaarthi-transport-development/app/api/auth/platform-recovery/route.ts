import {env} from 'cloudflare:workers';
import {sameOrigin,sessionCookie} from '@/lib/auth';
import {AppError} from '@/lib/service';
import {blockSupportAccess} from '@/lib/platform-service';
import {boundedBody} from '@/lib/request-body';
import {recoverPlatformPassword} from '@/lib/platform-recovery';
export const dynamic='force-dynamic';
export async function POST(request:Request){const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};try{
  sameOrigin(request);await blockSupportAccess(request);
  if(!env.DB)throw new AppError('Recovery unavailable.',503);
  const raw=await boundedBody(request,4096);let body:{token?:unknown;password?:unknown};try{body=JSON.parse(new TextDecoder().decode(raw));if(!body||typeof body!=='object')throw Error();}catch{throw new AppError('Invalid recovery request.');}const runtime=env as any;
  await recoverPlatformPassword(env.DB,{adminId:runtime.BILLING_ADMIN_USER_ID||'',tokenHash:runtime.PLATFORM_RECOVERY_HASH||'',expiresAt:runtime.PLATFORM_RECOVERY_EXPIRES_AT||''},body.token,body.password,request.headers.get('cf-connecting-ip')||'unknown');
  return Response.json({success:true},{headers:{...headers,'Set-Cookie':sessionCookie('',0)}});
}catch(e){return Response.json({error:e instanceof AppError?e.message:'Unable to reset password. Request a new recovery link.'},{status:e instanceof AppError?e.status:400,headers});}}
