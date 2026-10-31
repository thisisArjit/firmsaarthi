import {readFileSync} from 'node:fs';
import {releaseFingerprint} from './release-fingerprint.mjs';
import environments from '../config/environments.json' with {type:'json'};
let evidence;
try{evidence=JSON.parse(readFileSync('outputs/supplier-migration-validation.json','utf8'));}catch{throw Error('Missing Supplier/production48 migration reconciliation evidence. Do not deploy the divergent history.');}
if(evidence.status!=='passed'||evidence.fingerprint!==releaseFingerprint()||evidence.productionBaseSource!=='be900da6281d42280d87ccc44c97d6bd215da68e'||evidence.projectId!==environments.staging.projectId)throw Error('Matching successful Supplier/production48 migration reconciliation is required.');
if(!Number.isFinite(Date.parse(evidence.completedAt))||Date.parse(evidence.completedAt)>Date.now()||Date.now()-Date.parse(evidence.completedAt)>86400000)throw Error('Fresh migration reconciliation evidence is required.');
for(const name of ['populated-production48-upgrade','populated-supplier36-upgrade','hosted-pending-migration-selection'])if(!evidence.results?.some(r=>r.scenario===name&&r.status==='passed'))throw Error(`Missing migration proof: ${name}`);
if(evidence.results.some(r=>r.status!=='passed')||!evidence.versionId||!evidence.deploymentId)throw Error('Incomplete or failed migration proof blocks promotion.');
const baseline=JSON.parse(readFileSync('outputs/staging-validation.json','utf8'));
if(baseline.versionId!==evidence.versionId||baseline.deploymentId!==evidence.deploymentId)throw Error('Migration and baseline proof must use the same native stage.');
