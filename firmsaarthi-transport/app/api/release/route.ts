import {env} from 'cloudflare:workers';
import build from '@/lib/release-info.json';
export const dynamic='force-dynamic';
export async function GET(){
  return Response.json({environment:(env as unknown as {APP_ENV?:string}).APP_ENV==='staging'?'staging':'production',fingerprint:build.fingerprint},{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
