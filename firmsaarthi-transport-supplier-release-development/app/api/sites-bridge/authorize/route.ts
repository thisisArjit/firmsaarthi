import {env} from 'cloudflare:workers';
import {SitesBridge,type BridgeEnv} from '@/lib/sites-bridge';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{return await new SitesBridge(env as BridgeEnv).googleAuthorize(request);}catch{return new Response('This sign-in link expired. Please return to Sites by FirmSaarthi and try again.',{status:400,headers:{'Cache-Control':'no-store','Content-Type':'text/plain'}});}}
