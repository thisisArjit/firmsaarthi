import {env} from 'cloudflare:workers';
import {SitesAccount} from '@/lib/sites-account';
import {supportToken} from '@/lib/platform-service';
import type {BridgeEnv} from '@/lib/sites-bridge';
export const dynamic='force-dynamic';
export async function GET(request:Request){const account=new SitesAccount(env as BridgeEnv);try{if(supportToken(request))return new Response('Shared sign-in is unavailable in support mode.',{status:403,headers:{'Cache-Control':'no-store'}});return await account.authorize(request);}catch{return new Response('Shared sign-in expired or is unavailable. Return to Sites and start again.',{status:401,headers:{'Set-Cookie':account.cookie('',0),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});}}
