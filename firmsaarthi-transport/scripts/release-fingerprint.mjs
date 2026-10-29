import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function releaseFingerprint(root=process.cwd()){
  const files=[];
  function walk(relative){const absolute=path.join(root,relative);if(!existsSync(absolute))throw new Error(`Missing release input: ${relative}`);for(const entry of readdirSync(absolute,{withFileTypes:true})){const name=relative+'/'+entry.name;if(entry.isSymbolicLink())throw new Error('Release inputs must not be symlinks.');if(entry.isDirectory())walk(name);else if(name!=='lib/release-info.json')files.push(name);}}
  for(const folder of ['app','lib','public','db','drizzle','tests','scripts','config','worker'])walk(folder);
  files.push('package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.json','vite.config.ts','playwright.config.ts','playwright.staging.config.ts','vitest.config.ts');
  const hash=createHash('sha256');
  for(const file of files.sort()){const bytes=readFileSync(path.join(root,file));hash.update(file+'\0');hash.update(/\.(?:ts|tsx|mjs|js|json|sql|css|svg|yaml)$/.test(file)?bytes.toString('utf8').replace(/\r\n/g,'\n'):bytes);hash.update('\0');}
  return hash.digest('hex');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const fingerprint=releaseFingerprint();if(process.argv.includes('--write'))writeFileSync('lib/release-info.json',JSON.stringify({fingerprint})+'\n');console.log(fingerprint);}
