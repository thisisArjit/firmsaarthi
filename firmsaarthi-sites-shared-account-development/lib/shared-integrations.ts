import {hmac,SiteError} from './site-domain';
import type {SiteEnv} from './site-service';
import {relayEnabled,relayRequest} from './staging-bridge-relay';
export function sharedEnabled(env:SiteEnv){const expected=env.APP_ENV==='staging'?'https://firmsaarthi-transport-staging.arjit-tiwari-ece14.chatgpt.site/api/sites-bridge':'https://transport.firmsaarthi.com/api/sites-bridge';return env.SHARED_INTEGRATIONS_ENABLED==='true'&&!!env.SHARED_INTEGRATIONS_SECRET&&env.SHARED_INTEGRATIONS_URL===expected;}
export async function sharedCall(env:SiteEnv,data:Record<string,any>,fetcher:typeof fetch=fetch){
  if(!sharedEnabled(env))throw new SiteError('FirmSaarthi integration is unavailable.',503);
  const body=JSON.stringify(data),timestamp=String(Date.now()),nonce=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
  const signature=await hmac(env.SHARED_INTEGRATIONS_SECRET!,timestamp+'.'+nonce+'.'+body);
  const headers={'Content-Type':'application/json','x-fs-timestamp':timestamp,'x-fs-nonce':nonce,'x-fs-signature':signature};
  const response=relayEnabled(env)?await relayRequest(env,body,headers):await fetcher(env.SHARED_INTEGRATIONS_URL!,{method:'POST',signal:AbortSignal.timeout(25000),redirect:'manual',headers,body});
  const result=await response.json() as Record<string,any>;
  if(!response.ok)throw new SiteError(result.error||'FirmSaarthi could not complete this request. Please try again.',response.status);
  return result;
}
export function mailConfigured(env:SiteEnv){return sharedEnabled(env)||!!env.RESEND_API_KEY&&!!env.MAIL_FROM;}
export async function sendMail(env:SiteEnv,mail:{id:string;to:string;subject:string;text:string},fetcher:typeof fetch=fetch){
  if(sharedEnabled(env))return sharedCall(env,{action:'mail',mail},fetcher);
  if(!env.RESEND_API_KEY||!env.MAIL_FROM)throw new SiteError('Email delivery is unavailable.',503);
  const res=await fetcher('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(12000),headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':'sites/'+mail.id},body:JSON.stringify({from:`Sites by FirmSaarthi <${env.MAIL_FROM}>`,to:[mail.to],reply_to:'firmsaarthi@gmail.com',subject:mail.subject,text:mail.text})});
  if(!res.ok)throw new SiteError('Email delivery is unavailable.',503);const result=await res.json() as Record<string,any>;if(!result.id)throw new SiteError('Email delivery is unavailable.',503);return result;
}
