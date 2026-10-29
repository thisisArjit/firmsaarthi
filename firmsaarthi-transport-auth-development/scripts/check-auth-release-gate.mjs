// Additive checks: keep the original hosted and dependency gates intact.
import './check-release-gate.mjs';
import './check-security-gate.mjs';
import {readFileSync} from 'node:fs';
import {validateAuthRelease} from '../lib/auth-release-validation.mjs';
const evidence=JSON.parse(readFileSync(process.argv[2]||'outputs/staging-validation.json','utf8'));
validateAuthRelease(evidence.results);
console.log('Additional authentication hosted gate passed.');
