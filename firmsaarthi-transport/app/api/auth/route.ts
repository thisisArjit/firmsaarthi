import {rejectSupportWrite} from '@/lib/platform-service';
import { env } from 'cloudflare:workers';
import { AuthService, sameOrigin, sessionCookie } from '@/lib/auth';
import { AppError } from '@/lib/service';
import { googleConfig } from '@/lib/google-auth';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export async function GET(request:Request){
  const config=googleConfig(env),auth=env.DB?new AuthService(env.DB):null,user=await auth?.user(request.headers.get('cookie'));
  const account=user?await auth!.q('SELECT password_hash FROM password_accounts WHERE user_id=?',user.userId).first<{password_hash:string}>():null;
  const linked=user?await auth!.q('SELECT email FROM google_identities WHERE user_id=?',user.userId).first<{email:string}>():null;
  return Response.json({googleEnabled:!!config,email:user?.email||null,hasPassword:!!account&&!account.password_hash.startsWith('google-only$'),googleLinked:!!linked},{headers});
}
export async function POST(request:Request){try{
  if(Number(request.headers.get('content-length')||0)>8192)throw new AppError('Request too large.',413);
  const raw=await request.text();if(raw.length>8192)throw new AppError('Request too large.',413);
  // Consume the bounded body before rejecting origin: Workers must not leave a
  // cloned request stream unread when an early response completes.
  sameOrigin(request);rejectSupportWrite(request);if(!env.DB)throw new AppError('Database unavailable.',503);
  const body=JSON.parse(raw),auth=new AuthService(env.DB),cookie=request.headers.get('cookie'),ip=request.headers.get('cf-connecting-ip')||'local';
  if(body.action==='logout'){await auth.logout(cookie);return Response.json({success:true},{headers:{...headers,'Set-Cookie':sessionCookie('',0)}});}
  let token:string;
  if(body.action==='login')token=await auth.login(body.email,body.password,ip);
  else if(body.action==='signup')token=await auth.signup(body.email,body.password,body.businessName,ip);
  else if(body.action==='password.change'){
    const user=await auth.user(cookie);if(!user)throw new AppError('Sign in to continue.',401);
    token=await auth.changePassword(user,body.currentPassword,body.password,ip);
  }else throw new AppError('Unknown action.',404);
  return Response.json({success:true},{headers:{...headers,'Set-Cookie':sessionCookie(token)}});
}catch(error){return Response.json({error:error instanceof Error?error.message:'Request failed.'},{status:error instanceof AppError?error.status:400,headers});}}
