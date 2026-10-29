import {env} from 'cloudflare:workers';
import {AuthService,sameOrigin} from '@/lib/auth';
import {AppError,TransportService} from '@/lib/service';
import {BillingService} from '@/lib/billing';
import {blockSupportAccess} from '@/lib/platform-service';
import {boundedBody} from '@/lib/request-body';
import {WorkspaceStagePolicies} from '@/lib/workspace-stage-policy';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};

async function service(request:Request){
  await blockSupportAccess(request);
  if(!env.DB)throw new AppError('Database unavailable.',503);
  const user=await new AuthService(env.DB).user(request.headers.get('cookie'));
  if(!user)throw new AppError('Sign in to continue.',401);
  const s=new TransportService(env.DB,user),member=await s.member();
  await new BillingService(s,(env as unknown as {BILLING_ADMIN_USER_ID?:string}).BILLING_ADMIN_USER_ID).requireAccess();
  if(new URL(request.url).search)throw new AppError('Stage policy requests do not accept query parameters.');
  return {s,member,policies:new WorkspaceStagePolicies(s)};
}
function failure(e:unknown){return Response.json({error:e instanceof AppError?e.message:'Unable to load or save the stage evidence policy. Please try again.'},{status:e instanceof AppError?e.status:500,headers});}
async function state(policies:WorkspaceStagePolicies,owner:boolean){
  if(!owner)return {current:await policies.current(),canManage:false};
  // One revision query keeps current/history consistent during a concurrent owner save.
  const history=await policies.history(),latest=history[0];
  return {current:latest?{id:latest.id,version:latest.version,policy:latest.policy,createdAt:latest.createdAt}:null,canManage:true,history};
}

// Unpublished candidate: complete immutable trip opt-in, stage files and UI before deployment.
export async function GET(request:Request){try{const {member,policies}=await service(request);return Response.json(await state(policies,member.role==='OWNER'),{headers});}catch(e){return failure(e);}}
export async function POST(request:Request){try{
  sameOrigin(request);const {s,policies}=await service(request);await s.owner();
  if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw new AppError('Use a JSON stage policy request.',415);
  const bytes=await boundedBody(request,8192);let body:Record<string,unknown>;
  try{const value=JSON.parse(new TextDecoder().decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();body=value;}catch{throw new AppError('Enter a valid stage policy request.');}
  const keys=Object.keys(body);if(keys.length!==3||keys.some(key=>!['action','policy','version'].includes(key))||body.action!=='save')throw new AppError('Use only action, policy and version to save a stage policy.');
  await policies.save(body.policy,body.version);
  return Response.json(await state(policies,true),{headers});
}catch(e){return failure(e);}}
