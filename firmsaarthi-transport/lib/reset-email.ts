import {AppError} from './service';
import type {ResetMail} from './password-reset';
export type ResetEmailConfig={apiKey:string;from:string;replyTo:string;secret:string};
const address=(v:unknown)=>typeof v==='string'&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v)&&!/[\r\n]/.test(v);
export function resetEmailConfig(env:Record<string,unknown>):ResetEmailConfig|null{
 const apiKey=env.RESEND_API_KEY,from=env.PASSWORD_RESET_FROM,replyTo=env.PASSWORD_RESET_REPLY_TO,secret=env.PASSWORD_RESET_SECRET;
 if(typeof apiKey!=='string'||!apiKey.startsWith('re_')||!address(from)||!address(replyTo)||typeof secret!=='string'||!/^[a-f0-9]{64}$/.test(secret))return null;
 return {apiKey,from:from as string,replyTo:replyTo as string,secret};
}
export async function sendResetEmail(config:ResetEmailConfig,mail:ResetMail,transport:typeof fetch=fetch){
 if(!address(mail.to)||!/^\d{6}$/.test(mail.code)||!/^[a-f0-9]{64}$/.test(mail.requestId))throw new AppError('Email delivery unavailable.',503);
 const response=await transport('https://api.resend.com/emails',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json','Idempotency-Key':`password-reset/${mail.requestId}`},body:JSON.stringify({from:`FirmSaarthi <${config.from}>`,to:[mail.to],reply_to:config.replyTo,subject:'Your FirmSaarthi password reset code',text:`Your FirmSaarthi password reset code is ${mail.code}.\n\nIt expires in 10 minutes. Enter it only on the FirmSaarthi page where you requested it. Do not share this code.\n\nIf you did not request a password reset, you can ignore this email. Your password has not changed.`})});
 if(!response.ok)throw new AppError('Email delivery unavailable.',503);const body=await response.json() as {id?:unknown};if(typeof body.id!=='string'||!body.id)throw new AppError('Email delivery unavailable.',503);
}
