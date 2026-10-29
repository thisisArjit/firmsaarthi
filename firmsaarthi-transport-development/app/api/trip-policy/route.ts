import {env} from 'cloudflare:workers';
import {AuthService,sameOrigin} from '@/lib/auth';
import {AppError,TransportService} from '@/lib/service';
import {BillingService} from '@/lib/billing';
import {blockSupportAccess} from '@/lib/platform-service';
import {boundedBody} from '@/lib/request-body';
import {WorkspacePodPolicies} from '@/lib/workspace-pod-policy';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};

async function service(request:Request){
  await blockSupportAccess(request);
  if(!env.DB)throw new AppError('Database unavailable.',503);
  const user=await new AuthService(env.DB).user(request.headers.get('cookie'));
  if(!user)throw new AppError('Sign in to continue.',401);
  const s=new TransportService(env.DB,user),member=await s.member();
  await new BillingService(s,(env as unknown as {BILLING_ADMIN_USER_ID?:string}).BILLING_ADMIN_USER_ID).requireAccess();
  return {s,member,policies:new WorkspacePodPolicies(s)};
}
function failure(e:unknown){return Response.json({error:e instanceof AppError?e.message:'Unable to update the evidence policy. Please try again.'},{status:e instanceof AppError?e.status:500,headers});}
async function state(policies:WorkspacePodPolicies,owner:boolean){return {policy:await policies.current(),canManage:owner,...(owner?{history:await policies.history()}:{})};}

// Unpublished candidate: complete trip snapshot/replay integration and Settings UI before release.
export async function GET(request:Request){try{const {member,policies}=await service(request);return Response.json(await state(policies,member.role==='OWNER'),{headers});}catch(e){return failure(e);}}
export async function POST(request:Request){try{
  sameOrigin(request);const {s,policies}=await service(request);await s.owner();
  const bytes=await boundedBody(request,8192);let body:Record<string,unknown>;
  try{const value=JSON.parse(new TextDecoder().decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();body=value;}catch{throw new AppError('Enter a valid evidence policy request.');}
  if(body.action!=='save')throw new AppError('Choose a supported evidence policy action.');
  await policies.save(body.mode,body.version);
  return Response.json(await state(policies,true),{headers});
}catch(e){return failure(e);}}
