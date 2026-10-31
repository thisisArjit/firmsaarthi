import {env} from 'cloudflare:workers';
import {SitesBridge,type BridgeEnv} from '@/lib/sites-bridge';
import {boundedBody} from '@/lib/request-body';
import {AppError} from '@/lib/service';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{const raw=new TextDecoder().decode(await boundedBody(request,100000));const bridge=new SitesBridge(env as BridgeEnv);await bridge.authorize(request,raw);return Response.json(await bridge.action(JSON.parse(raw)),{headers:{'Cache-Control':'no-store'}});}catch(e){return Response.json({error:e instanceof AppError?e.message:'Integration unavailable.'},{status:e instanceof AppError?e.status:503,headers:{'Cache-Control':'no-store'}});}}
