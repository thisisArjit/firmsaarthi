import {env} from 'cloudflare:workers';
import {AuthService,sameOrigin} from '@/lib/auth';
import {AppError,TransportService} from '@/lib/service';
import {PlatformService,supportCookieName,supportToken} from '@/lib/platform-service';
import {boundedBody} from '@/lib/request-body';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const cookie=(token:string,age=1800)=>`${supportCookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
async function service(request:Request){if(!env.DB)throw new AppError('Database unavailable.',503);const user=await new AuthService(env.DB).user(request.headers.get('cookie'));if(!user)throw new AppError('Sign in to continue.',401);return {user,platform:new PlatformService(env.DB,user,(env as any).BILLING_ADMIN_USER_ID||'')};}
function failure(e:unknown){return Response.json({error:(e as Error).message},{status:e instanceof AppError?e.status:400,headers});}
export async function GET(request:Request){try{const {user,platform}=await service(request),url=new URL(request.url),token=supportToken(request);
  if(url.searchParams.get('view')==='audit'){const m=await new TransportService(env.DB!,user).owner();return Response.json({events:(await env.DB!.prepare("SELECT actor,action,target,created_at FROM audit WHERE org_id=? AND action LIKE 'support.%' ORDER BY created_at DESC LIMIT 100").bind(m.org_id).all()).results},{headers});}
  if(url.searchParams.get('view')==='status')return Response.json(token?{active:true,session:await platform.session(token)}:{active:false},{headers});
  if(url.searchParams.has('asset')){const {asset,org}=await platform.file(token,url.searchParams.get('asset')!),object=await env.BUCKET?.get(org+'/'+asset.id);if(!object)throw new AppError('Document unavailable.',404);return new Response(object.body,{headers:{...headers,'Content-Type':asset.mime,'Content-Disposition':'inline','Content-Security-Policy':"sandbox; default-src 'none'"}});}
  return Response.json(await platform.records(token,url.searchParams.get('table')||'consignments',Number(url.searchParams.get('offset')||0)),{headers});
}catch(e){return failure(e);}}
export async function POST(request:Request){try{sameOrigin(request);const body=JSON.parse(new TextDecoder().decode(await boundedBody(request,8192)));
  if(body.action==='support.end'){try{const {platform}=await service(request);await platform.end(supportToken(request));}catch(e){if(!(e instanceof AppError&&[401,403].includes(e.status)))throw e;}return Response.json({success:true},{headers:{...headers,'Set-Cookie':cookie('',0)}});}
  const {platform}=await service(request);await platform.admin();
  if(body.action!=='support.start')throw new AppError('Unknown platform action.',404);if(supportToken(request))throw new AppError('Exit the current support session first.',409);const result=await platform.start(String(body.orgId||''),body.reason);return Response.json({success:true,org:result.org,expiresAt:result.expiresAt},{headers:{...headers,'Set-Cookie':cookie(result.token)}});
}catch(e){return failure(e);}}
