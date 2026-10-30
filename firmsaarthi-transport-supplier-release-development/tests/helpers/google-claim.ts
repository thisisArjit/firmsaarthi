import {GoogleAuth,type GoogleIdentity} from '../../lib/google-auth';
import {GoogleAccountClaim,GoogleAccountClaimRequired} from '../../lib/google-account-claim';
export const claimedPassword='Synthetic fresh claimed password 2026';
/** In-memory sender only. Never use this helper as hosted/provider evidence. */
export async function finishSyntheticGoogleClaim(google:GoogleAuth,flow:any,identity:GoogleIdentity,cookie:string|null=null){
 let target;try{return await google.complete(flow,identity,cookie);}catch(e){if(!(e instanceof GoogleAccountClaimRequired))throw e;target=e.target;}
 const mail:any[]=[],s=new GoogleAccountClaim(google.db,'ab'.repeat(32),async m=>{mail.push(m);}),session=await s.start(target),request=await s.request(session,'unit-claim'),r={requestId:request.requestId,proof:request.proof,ready:null as string|null};r.ready=(await s.verify(session,r,mail.at(-1).code,'unit-claim')).resetToken;const receipt=await s.complete(session,r,claimedPassword,true);return google.auth.issue(receipt.userId,receipt.credentialVersion);
}
