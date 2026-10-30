import {env} from 'cloudflare:workers';
import {AuthService,sameOrigin,sessionCookie} from '@/lib/auth';
import {AppError} from '@/lib/service';
import {rejectSupportWrite} from '@/lib/platform-service';
import {digest} from '@/lib/passwords';
import {boundedBody} from '@/lib/request-body';
import {resetEmailConfig} from '@/lib/reset-email';
import {sendSignupEmail} from '@/lib/signup-email';
import {SignupEmailProof,signupCookie,signupCookieName,signupReadyCookieName,signupSession} from '@/lib/signup-email-proof';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
function service(){const config=resetEmailConfig(env as any);return env.DB&&config?new SignupEmailProof(env.DB,config.secret,mail=>sendSignupEmail(config,mail),()=>Date.now(),(env as any).APP_ENV==='staging'?20:70):null;}
function cookies(response:Response,values:string[]){for(const value of values)response.headers.append('Set-Cookie',value);return response;}
const clear=()=>[signupCookie(signupCookieName(),'',0),signupCookie(signupReadyCookieName(),'',0)];
export async function GET(request:Request){try{
 const signup=service(),session=signupSession(request.headers.get('cookie')),progress=signup&&session?await signup.progress(session.requestId,session.proof,session.registrationToken):null;
 return Response.json({enabled:!!signup,step:progress?.step||'email',...(progress?{reviewRef:await digest('signup-ui:'+session!.requestId),email:progress.email,businessKind:progress.businessKind,expiresAt:progress.expiresAt,...('resendAt' in progress?{resendAt:progress.resendAt}:{})}:{})},{headers});
}catch{return Response.json({error:'Email registration is temporarily unavailable.'},{status:503,headers});}}
export async function POST(request:Request){try{
 const raw=await boundedBody(request,4096);sameOrigin(request);rejectSupportWrite(request);
 let body:Record<string,unknown>;try{body=JSON.parse(new TextDecoder().decode(raw));if(!body||typeof body!=='object'||Array.isArray(body))throw Error();}catch{throw new AppError('Invalid registration request.');}
 if(body.action==='cancel'){
  const active=signupSession(request.headers.get('cookie'));
  if(active&&body.reviewRef!==await digest('signup-ui:'+active.requestId))throw new AppError('Registration changed in another tab. Reload before cancelling it.',409);
  return cookies(Response.json({success:true},{headers}),clear());
 }
 const signup=service();if(!signup||!env.DB)throw new AppError('Email registration is temporarily unavailable. Try again later or continue with Google.',503);
 const auth=new AuthService(env.DB),user=await auth.user(request.headers.get('cookie')),ip=request.headers.get('cf-connecting-ip')||'unknown',session=signupSession(request.headers.get('cookie'));
 if(user&&body.action!=='complete')throw new AppError('Sign out before creating another account.',409);
 if(body.action==='request'){
  const result=await signup.request(body.email,ip,body.businessKind);
  return cookies(Response.json({message:result.message,step:'code',reviewRef:await digest('signup-ui:'+result.requestId)},{headers}),[signupCookie(signupCookieName(),result.requestId+'.'+result.proof,600),signupCookie(signupReadyCookieName(),'',0)]);
 }
 if(!session)throw new AppError('Registration expired. Start again with your email.');
 if(body.reviewRef!==await digest('signup-ui:'+session.requestId))throw new AppError('Registration changed in another tab. Start again here.',409);
 if(body.action==='verify'){
  const verified=await signup.verify(session.requestId,body.code,session.proof,ip);
  return cookies(Response.json({step:'details'},{headers}),[signupCookie(signupReadyCookieName(),session.requestId+'.'+verified.registrationToken,300)]);
 }
 if(body.action==='complete'){
  const result=await signup.complete(session.requestId,session.registrationToken,body.password,body.businessName,session.proof,ip,user?.userId,body.businessKind),token=await auth.issue(result.userId,result.credentialVersion);
  return cookies(Response.json({success:true,alreadyCreated:result.alreadyCreated},{headers}),[sessionCookie(token),...clear()]);
 }
 throw new AppError('Unknown registration action.');
}catch(e){return Response.json({error:e instanceof AppError?e.message:'Unable to create an account. Please try again.'},{status:e instanceof AppError?e.status:500,headers});}}
