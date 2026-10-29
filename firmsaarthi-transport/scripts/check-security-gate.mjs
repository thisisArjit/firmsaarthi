import {readFileSync} from 'node:fs';
import {releaseFingerprint} from './release-fingerprint.mjs';
import {reviewDependencyAudit} from '../lib/security-audit-policy.mjs';
const evidence=JSON.parse(readFileSync('outputs/security-validation.json','utf8'));
const review=JSON.parse(readFileSync('config/security-review.json','utf8'));
const summary=reviewDependencyAudit(JSON.parse(readFileSync('outputs/security-audit.json','utf8')),review);
if(evidence.status!=='passed'||evidence.fingerprint!==releaseFingerprint()||!Number.isFinite(Date.parse(evidence.checkedAt))||Date.parse(evidence.checkedAt)>Date.now()||Date.now()-Date.parse(evidence.checkedAt)>24*3600000||JSON.stringify(evidence.openFindings)!==JSON.stringify(summary.openFindings))throw Error('Fresh matching-source dependency evidence is required.');
console.log('Security dependency gate passed; reviewed open tool findings are recorded, not certified safe.');
