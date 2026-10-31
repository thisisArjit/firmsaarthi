import {env} from 'cloudflare:workers';
import {sameOrigin} from '@/lib/auth';
import {rejectSupportWrite} from '@/lib/platform-service';
import {boundedBody} from '@/lib/request-body';
import {AppError} from '@/lib/service';
import {PasswordReset,resetCookie,resetProof} from '@/lib/password-reset';
import {resetEmailConfig,sendResetEmail} from '@/lib/reset-email';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
export async function GET(){return Response.json({enabled:!!env.DB&&!!resetEmailConfig(env as any)},{headers});}
export async function POST(request:Request){try{
 const raw=await boundedBody(request,4096);sameOrigin(request);rejectSupportWrite(request);const config=resetEmailConfig(env as any);if(!env.DB||!config)throw new AppError('Email password reset is temporarily unavailable. Please try again later.',503);
 let body:Record<string,unknown>;try{body=JSON.parse(new TextDecoder().decode(raw));if(!body||typeof body!=='object'||Array.isArray(body))throw Error();}catch{throw new AppError('Invalid reset request.');}
 const service=new PasswordReset(env.DB,config.secret,mail=>sendResetEmail(config,mail),()=>Date.now(),(env as any).APP_ENV==='staging'?20:70),ip=request.headers.get('cf-connecting-ip')||'unknown',proof=resetProof(request.headers.get('cookie'));
 if(body.action==='request'){const result=await service.request(body.email,ip);return Response.json({requestId:result.requestId,message:result.message},{headers:{...headers,'Set-Cookie':resetCookie(result.proof)}});}
 if(body.action==='verify')return Response.json(await service.verify(body.requestId,body.code,proof,ip),{headers});
 if(body.action==='complete'){const result=await service.complete(body.requestId,body.resetToken,body.password,proof,ip);return Response.json(result,{headers:{...headers,'Set-Cookie':resetCookie('',0)}});}
 throw new AppError('Unknown reset action.',400);
 }catch(e){return Response.json({error:e instanceof AppError?e.message:'Unable to reset your password. Please try again.'},{status:e instanceof AppError?e.status:500,headers});}}
