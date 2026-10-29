export const requiredAuthScenarios=['email-signup-and-recovery','legacy-google-account-claim','existing-signin-preserved'];
export function validateAuthRelease(results){
 if(!Array.isArray(results)||results.some(r=>r.status!=='passed'))throw Error('Failed, skipped or missing authentication evidence blocks release.');
 for(const device of ['desktop','phone'])for(const scenario of requiredAuthScenarios){
  const matches=results.filter(r=>r.device===device&&r.scenario===scenario);
  if(matches.length!==1)throw Error(`Exactly one passing hosted authentication check is required: ${device}/${scenario}`);
  const result=matches[0],viewport=result.viewport;
  if(result.runner!=='playwright'&&result.runner!=='cua')throw Error('Hosted browser authentication evidence is required.');
  if(result.viewportMeasured!==true||!viewport||!Number.isInteger(viewport.width)||!Number.isInteger(viewport.height)||viewport.height<600||(device==='phone'?(viewport.width<320||viewport.width>480):viewport.width<1024))throw Error('Authentication evidence must contain the actual measured device viewport.');
 }
}
