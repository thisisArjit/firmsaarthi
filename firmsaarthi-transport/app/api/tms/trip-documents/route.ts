import {blockSupportAccess} from '@/lib/platform-service';
import { env } from 'cloudflare:workers';
import { AuthService } from '@/lib/auth';
import { AppError, TransportService } from '@/lib/service';
import { TripDocuments } from '@/lib/trip-documents';
import { BillingService } from '@/lib/billing';
import { boundedBody } from '@/lib/request-body';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export async function POST(request:Request){try{await blockSupportAccess(request);
  // Bound the entire multipart body, not just the reported File.size.
  const bytes=await boundedBody(request,3*1024*1024);
  if(request.headers.get('origin')!==new URL(request.url).origin)throw new AppError('Cross-origin writes are blocked.',403);
  if(!env.DB||!env.BUCKET)throw new AppError('Document storage is unavailable.',503);
  const user=await new AuthService(env.DB).user(request.headers.get('cookie'));if(!user)throw new AppError('Sign in to continue.',401);
  const svc=new TransportService(env.DB,user);await svc.owner();
  await new BillingService(svc,(env as unknown as {BILLING_ADMIN_USER_ID?:string}).BILLING_ADMIN_USER_ID).requireAccess();
  const form=await new Response(bytes,{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData(),file=form.get('file');
  if(!(file instanceof File))throw new AppError('Choose a POD file.');
  const data=Object.fromEntries(['tripId','allocationId','version','requestId'].map(k=>[k,form.get(k)]));
  return Response.json(await new TripDocuments(svc).upload(data,{name:file.name,type:file.type,bytes:new Uint8Array(await file.arrayBuffer())},env.BUCKET),{headers});
}catch(error){const e=error as Error;return Response.json({error:/UNIQUE constraint/i.test(e.message)?'This upload conflicts with a recent change. Reload and try again.':e.message||'Upload failed.'},{status:error instanceof AppError?error.status:/UNIQUE constraint/i.test(e.message)?409:400,headers});}}
