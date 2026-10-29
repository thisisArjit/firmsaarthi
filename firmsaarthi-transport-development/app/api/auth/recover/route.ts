import { env } from 'cloudflare:workers';
import {rejectSupportWrite} from '@/lib/platform-service';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { AuthService, sameOrigin, sessionCookie } from '@/lib/auth';
import { AppError } from '@/lib/service';
import type { Row } from '@/lib/domain';
import { hashPassword, validatePassword } from '@/lib/passwords';
export const dynamic='force-dynamic';
export async function POST(request:Request){const headers={'Cache-Control':'no-store'};try{
  if(Number(request.headers.get('content-length')||0)>4096)throw new AppError('Request too large.',413);
  const raw=await request.text();if(raw.length>4096)throw new AppError('Request too large.',413);
  sameOrigin(request);rejectSupportWrite(request);const user=await getChatGPTUser();if(!user||!env.DB)throw new AppError('Owner sign-in required.',401);
  const row=await env.DB.prepare("SELECT a.credential_version FROM password_accounts a JOIN memberships m ON m.user_id=a.user_id WHERE a.user_id=? AND m.role='OWNER' AND a.disabled=0").bind(user.userId).first<Row>();
  if(!row)throw new AppError('Only the original workspace owner can recover access.',403);
  const body=JSON.parse(raw);validatePassword(body.password);
  const hash=await hashPassword(body.password),version=crypto.randomUUID();
  await env.DB.batch([env.DB.prepare('UPDATE password_accounts SET password_hash=?,credential_version=?,updated_at=? WHERE user_id=?').bind(hash,version,new Date().toISOString(),user.userId),env.DB.prepare('DELETE FROM auth_sessions WHERE user_id=?').bind(user.userId)]);
  const token=await new AuthService(env.DB).issue(user.userId,version);
  return Response.json({success:true},{headers:{...headers,'Set-Cookie':sessionCookie(token)}});
}catch(e){return Response.json({error:e instanceof Error?e.message:'Recovery failed.'},{status:e instanceof AppError?e.status:400,headers});}}
