import {AppError} from './service';
import {boundedBody} from './request-body';
import type {ResetEmailConfig} from './reset-email';
import type {SignupMail} from './signup-email-proof';
export async function sendSignupEmail(config:ResetEmailConfig,mail:SignupMail,transport:typeof fetch=fetch){
 if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(mail.to)||!/^\d{6}$/.test(mail.code)||!/^[a-f0-9]{64}$/.test(mail.requestId))throw new AppError('Email delivery unavailable.',503);
 try{
  const response=await transport('https://api.resend.com/emails',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json','Idempotency-Key':`signup-email/${mail.requestId}`},body:JSON.stringify({from:`FirmSaarthi <${config.from}>`,to:[mail.to],reply_to:config.replyTo,subject:'Confirm your FirmSaarthi email',text:`Your FirmSaarthi email confirmation code is ${mail.code}.\n\nIt expires in 10 minutes. Enter it only on the page where you requested it, then choose your own password. Do not share this code.\n\nIf you did not request an account, ignore this email. No account or password has been created.`})});
  if(!response.ok)throw Error();const result=JSON.parse(new TextDecoder().decode(await boundedBody(response,4096)));if(typeof result?.id!=='string'||!result.id)throw Error();
 }catch{throw new AppError('Email delivery unavailable.',503);}
}
