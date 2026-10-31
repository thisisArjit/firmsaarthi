import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {releaseFingerprint} from './release-fingerprint.mjs';
import {reviewDependencyAudit} from '../lib/security-audit-policy.mjs';
mkdirSync('outputs',{recursive:true});
// Fixed command and arguments only; no user/customer strings or credentials.
const result=process.platform==='win32'?spawnSync(process.env.ComSpec||'C:/Windows/System32/cmd.exe',['/d','/s','/c','pnpm audit --json'],{encoding:'utf8',windowsHide:true,maxBuffer:10*1024*1024}):spawnSync('pnpm',['audit','--json'],{encoding:'utf8',maxBuffer:10*1024*1024});
if(result.error||![0,1].includes(result.status))throw Error('Dependency registry audit did not complete.');
let audit;try{audit=JSON.parse(result.stdout);}catch{throw Error('Dependency registry returned an invalid audit.');}
const summary=reviewDependencyAudit(audit,JSON.parse(readFileSync('config/security-review.json','utf8')));
writeFileSync('outputs/security-audit.json',JSON.stringify(audit,null,2));
writeFileSync('outputs/security-validation.json',JSON.stringify({status:'passed',fingerprint:releaseFingerprint(),checkedAt:new Date().toISOString(),...summary},null,2));
console.log(`Dependency audit: no high/critical findings; ${summary.openFindings.length} explicitly reviewed tool findings remain open.`);
