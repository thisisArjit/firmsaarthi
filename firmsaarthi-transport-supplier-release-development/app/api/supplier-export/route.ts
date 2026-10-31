import {env} from 'cloudflare:workers';
import {AuthService} from '@/lib/auth';
import {AppError} from '@/lib/service';
import {blockSupportAccess} from '@/lib/platform-service';
import {SupplierMarketplace} from '@/lib/supplier-marketplace';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
export async function GET(request:Request){try{
  await blockSupportAccess(request);if(!env.DB)throw new AppError('Database is unavailable.',503);
  const user=await new AuthService(env.DB).user(request.headers.get('cookie'));if(!user)throw new AppError('Sign in to download your saved supplier data.',401);
  const url=new URL(request.url);if([...url.searchParams.keys()].length!==1||!url.searchParams.has('kind'))throw new AppError('Choose a private fleet or route export. Other scopes are not supported.');
  const file=await new SupplierMarketplace(env.DB,user).exportCsv(url.searchParams.get('kind'));
  return new Response(file.content,{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${file.filename}"`,'Content-Security-Policy':"sandbox; default-src 'none'",'X-Export-As-Of':file.asOf,'X-Export-Row-Count':String(file.count)}});
}catch(error){return Response.json({error:error instanceof AppError?error.message:'Unable to prepare this export. Your saved data has not changed. Try again.'},{status:error instanceof AppError?error.status:503,headers});}}
