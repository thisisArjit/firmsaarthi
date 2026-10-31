import './check-release-gate.mjs';
import './check-security-gate.mjs';
import {readFileSync,existsSync} from 'node:fs';
import {releaseFingerprint} from './release-fingerprint.mjs';
if(!existsSync('lib/signup-email-proof.ts')||!existsSync('lib/google-account-claim.ts')||!existsSync('scripts/check-auth-release-gate.mjs'))throw Error('Integrate the reviewed mailbox-proof and legacy account-claim protection before shared-account production release.');
await import('./check-auth-release-gate.mjs');
let proof;try{proof=JSON.parse(readFileSync('outputs/shared-account-validation.json','utf8'));}catch{throw Error('Missing two-product private hosted shared-account proof.');}
if(proof.status!=='passed'||proof.transportFingerprint!==releaseFingerprint()||!/^[a-f0-9]{64}$/.test(proof.sitesFingerprint||'')||proof.ownershipAndLegacyClaimHardened!==true)throw Error('Current-source shared-account and legacy-claim hardening evidence is required.');
if(proof.transportProjectId!=='appgprj_6ae065554e2c819195306c14a182519e'||!proof.sitesProjectId||proof.sitesProjectId==='appgprj_6ae4e085f65c819182c28a66b36f3046'||proof.sitesAudience!=='owner-private'||!proof.transportVersionId||!proof.transportDeploymentId||!proof.sitesVersionId||!proof.sitesDeploymentId)throw Error('Both isolated private native staging deployments are required.');
if(!Number.isFinite(Date.parse(proof.completedAt))||Date.parse(proof.completedAt)>Date.now()||Date.now()-Date.parse(proof.completedAt)>86400000)throw Error('Fresh hosted shared-account evidence is required.');
for(const device of ['desktop','phone'])for(const scenario of ['first-link-otp-and-consent','returning-shared-session','cross-account-and-role-denial','callback-state-browser-replay-expiry','central-disable-reset-and-logout','sites-existing-login-data-and-plans'])if(!proof.results?.some(r=>r.device===device&&r.scenario===scenario&&r.status==='passed'&&r.measuredViewport?.width===(device==='phone'?390:1280)))throw Error('Missing hosted shared-account proof: '+device+'/'+scenario);
if(proof.results.some(r=>r.status!=='passed'))throw Error('Failed or incomplete shared-account proof blocks release.');
const baseline=JSON.parse(readFileSync('outputs/staging-validation.json','utf8'));if(baseline.versionId!==proof.transportVersionId||baseline.deploymentId!==proof.transportDeploymentId)throw Error('Shared-account and original Transport baseline must match native staging.');
