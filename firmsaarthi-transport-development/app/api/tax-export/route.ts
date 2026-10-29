import {env} from 'cloudflare:workers';
import {AuthService} from '@/lib/auth';
import {TransportService,AppError} from '@/lib/service';
import {BillingService} from '@/lib/billing';
import {blockSupportAccess} from '@/lib/platform-service';
import {taxExport} from '@/lib/tax-export';
import {zipFiles} from '@/lib/export-files';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Cookie'};
export async function GET(request:Request){try{
 await blockSupportAccess(request);if(!env.DB)throw new AppError('Database unavailable.',503);
 const user=await new AuthService(env.DB).user(request.headers.get('cookie'));if(!user)throw new AppError('Sign in to continue.',401);
 const svc=new TransportService(env.DB,user);await svc.owner();await new BillingService(svc,(env as unknown as {BILLING_ADMIN_USER_ID?:string}).BILLING_ADMIN_USER_ID).requireAccess();
 const url=new URL(request.url),download=url.searchParams.get('file');if(download&&!/^[-a-z0-9_.]+$/i.test(download))throw new AppError('Choose a listed export file.');
 const pack=await taxExport(svc,url.searchParams.get('year')||'',url.searchParams.get('from')||undefined,url.searchParams.get('to')||undefined);
 if(!download)return Response.json({...pack,files:pack.files.map(f=>({name:f.name,type:f.type,bytes:f.bytes.length,rows:f.rows}))},{headers});
 if(download==='all.zip')return new Response(zipFiles(pack.files) as BodyInit,{headers:{...headers,'Content-Type':'application/zip','Content-Disposition':`attachment; filename="CA-review-${pack.from}-${pack.to}.zip"`}});
 const file=pack.files.find(f=>f.name===download);if(!file)throw new AppError('Export file not found.',404);
 return new Response(file.bytes as BodyInit,{headers:{...headers,'Content-Type':file.type,'Content-Disposition':`attachment; filename="${file.name}"`}});
 }catch(e){return Response.json({error:e instanceof AppError?e.message:'Unable to prepare export. Try a shorter period or contact support.'},{status:e instanceof AppError?e.status:400,headers});}}
