import {env} from 'cloudflare:workers';
import {AuthService,sameOrigin,sessionCookie} from '@/lib/auth';
import {AppError} from '@/lib/service';
import {blockSupportAccess,rejectSupportWrite} from '@/lib/platform-service';
import {digest} from '@/lib/passwords';
import {boundedBody} from '@/lib/request-body';
import {resetEmailConfig,sendResetEmail} from '@/lib/reset-email';
import {businessMode} from '@/lib/business-mode';
import {GoogleAccountClaim,claimCookie,claimCookieName,claimResetCookieName,claimReadyCookieName,claimSession,claimResetSession} from '@/lib/google-account-claim';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const clear=()=>[claimCookie(claimCookieName(),'',0),claimCookie(claimResetCookieName(),'',0),claimCookie(claimReadyCookieName(),'',0)];
function response(value:unknown,cookies:string[]=[]){const r=Response.json(value,{headers});for(const c of cookies)r.headers.append('Set-Cookie',c);return r;}
function service(){const config=resetEmailConfig(env as any);if(!env.DB||!config)throw new AppError('Email sign-in confirmation is temporarily unavailable. Try again later.',503);return new GoogleAccountClaim(env.DB,config.secret,m=>sendResetEmail(config,m),()=>Date.now(),(env as any).APP_ENV==='staging'?20:70);}
export async function GET(request:Request){try{await blockSupportAccess(request);if(!env.DB)throw new AppError('Unavailable.',503);const cookie=request.headers.get('cookie'),session=claimSession(cookie),user=await new AuthService(env.DB).user(cookie);if(!session)return response({available:false,authenticated:!!user});const s=service();await s.authorize(session,user?.userId);const progress=await s.progress(session,claimResetSession(cookie));return response({available:true,...progress,reviewRef:await digest('google-claim-ui:'+session.id)});}catch(e){return Response.json({error:e instanceof AppError?e.message:'Unable to confirm sign-in.'},{status:e instanceof AppError?e.status:503,headers});}}
export async function POST(request:Request){try{
 const raw=await boundedBody(request,4096);sameOrigin(request);rejectSupportWrite(request);let body:Record<string,unknown>;try{body=JSON.parse(new TextDecoder().decode(raw));if(!body||typeof body!=='object'||Array.isArray(body))throw Error();}catch{throw new AppError('Invalid sign-in review.');}
 const cookie=request.headers.get('cookie'),session=claimSession(cookie),s=service(),reset=claimResetSession(cookie),ip=request.headers.get('cf-connecting-ip')||'unknown';
 const auth=new AuthService(env.DB!),user=await auth.user(cookie);if(session)await s.authorize(session,user?.userId);
 if(!session||body.reviewRef!==await digest('google-claim-ui:'+session.id))throw new AppError('The sign-in review changed in another tab. Start again with Google.',409);
 if(body.action==='cancel'){await s.cancel(session);return response({success:true},clear());}
 // The verified provider subject, email and target account are never caller inputs.
 const permitted=body.action==='request'?['action','reviewRef']:body.action==='verify'?['action','code','reviewRef']:body.action==='complete'?['action','password','confirm','reviewRef']:[];if(!permitted.length||Object.keys(body).some(k=>!permitted.includes(k)))throw new AppError('Invalid sign-in review.');
 if(body.action==='request'){const r=await s.request(session,ip);return response({step:'code',message:r.message},[claimCookie(claimResetCookieName(),r.requestId+'.'+r.proof),claimCookie(claimReadyCookieName(),'',0)]);}
 if(body.action==='verify'){const r=await s.verify(session,reset,body.code,ip);const review=await s.progress(session,{...reset!,ready:r.resetToken});return response(review,[claimCookie(claimReadyCookieName(),reset!.requestId+'.'+r.resetToken,300)]);}
 const r=await s.complete(session,reset,body.password,body.confirm,user?.userId,ip),token=await auth.issue(r.userId,r.credentialVersion),mode=await businessMode(env.DB!,r.userId);
 return response({success:true,alreadyCompleted:r.alreadyCompleted,next:mode==='supplier'?'/supplier':'/'},[sessionCookie(token),...clear()]);
 }catch(e){return Response.json({error:e instanceof AppError?e.message:'Unable to finish this sign-in review. Try again.'},{status:e instanceof AppError?e.status:503,headers});}}
