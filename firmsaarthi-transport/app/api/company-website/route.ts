import {env} from 'cloudflare:workers';
import {AuthService,sameOrigin} from '@/lib/auth';
import {AppError,TransportService} from '@/lib/service';
import {blockSupportAccess} from '@/lib/platform-service';
import {boundedBody} from '@/lib/request-body';
import {CompanyWebsiteService} from '@/lib/company-website-service';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
async function service(request:Request){await blockSupportAccess(request);if(!env.DB)throw new AppError('Database unavailable.',503);const user=await new AuthService(env.DB).user(request.headers.get('cookie'));if(!user)throw new AppError('Sign in to continue.',401);const s=new TransportService(env.DB,user);await s.owner();return new CompanyWebsiteService(s);}
function failure(e:unknown){return Response.json({error:e instanceof AppError?e.message:'Unable to update website. Please try again.'},{status:e instanceof AppError?e.status:500,headers});}
// Owners can take their public page down even if their subscription has expired.
export async function GET(request:Request){try{return Response.json(await(await service(request)).state(),{headers});}catch(e){return failure(e);}}
export async function POST(request:Request){try{sameOrigin(request);const s=await service(request),bytes=await boundedBody(request,16384);let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new AppError('Invalid website request.');}return Response.json(await s.command(body.action,body),{headers});}catch(e){return failure(e);}}
