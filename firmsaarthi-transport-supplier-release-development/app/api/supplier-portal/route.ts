import {env} from 'cloudflare:workers';
import {AuthService,sameOrigin} from '@/lib/auth';
import {AppError} from '@/lib/service';
import {blockSupportAccess} from '@/lib/platform-service';
import {boundedBody} from '@/lib/request-body';
import {SupplierMarketplace} from '@/lib/supplier-marketplace';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
async function service(request:Request){await blockSupportAccess(request);if(!env.DB)throw new AppError('Database is unavailable.',503);const user=await new AuthService(env.DB).user(request.headers.get('cookie'));if(!user)throw new AppError('Sign in to continue.',401);return new SupplierMarketplace(env.DB,user);}
function failure(e:unknown){return Response.json({error:e instanceof AppError?e.message:'Unable to save supplier details. Reload and check the last saved version before retrying.'},{status:e instanceof AppError?e.status:503,headers});}
export async function GET(request:Request){try{const s=await service(request),url=new URL(request.url);return Response.json(url.searchParams.get('view')==='discover'?await s.discover(Object.fromEntries(url.searchParams)):await s.state(),{headers});}catch(e){return failure(e);}}
export async function POST(request:Request){try{const raw=new TextDecoder().decode(await boundedBody(request,16384));sameOrigin(request);const s=await service(request);return Response.json(await s.command(JSON.parse(raw)),{headers});}catch(e){return failure(e);}}
