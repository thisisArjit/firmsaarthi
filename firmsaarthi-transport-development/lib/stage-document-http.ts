import {env} from 'cloudflare:workers';
import {AuthService} from './auth';
import {AppError,TransportService} from './service';
import {BillingService} from './billing';
import {blockSupportAccess} from './platform-service';

export const stageHeaders={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export async function stageOwner(request:Request){
  await blockSupportAccess(request);
  if(!env.DB)throw new AppError('Database unavailable.',503);
  const user=await new AuthService(env.DB).user(request.headers.get('cookie'));
  if(!user)throw new AppError('Sign in to continue.',401);
  const service=new TransportService(env.DB,user);await service.owner();
  await new BillingService(service,(env as unknown as {BILLING_ADMIN_USER_ID?:string}).BILLING_ADMIN_USER_ID).requireAccess();
  return service;
}
export function stageFailure(error:unknown){
  const conflict=error instanceof Error&&/UNIQUE constraint|FOREIGN KEY constraint/i.test(error.message);
  return Response.json({error:error instanceof AppError?error.message:conflict?'This document conflicts with a recent change. Reload and try again.':'Unable to load or save stage evidence. Please try again.'},{status:error instanceof AppError?error.status:conflict?409:500,headers:stageHeaders});
}
export function stageId(value:unknown){
  if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,200}$/.test(value))throw new AppError('Choose a valid trip or document.');
  return value;
}
export function noStageQuery(request:Request){if(new URL(request.url).search)throw new AppError('Do not include query parameters in a stage evidence write.');}
