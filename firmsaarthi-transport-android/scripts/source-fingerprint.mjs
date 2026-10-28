import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function sourceFingerprint(){
 const files=['app/build.gradle','settings.gradle','build.gradle','gradle.properties','package.json'];
 function walk(folder){for(const entry of readdirSync(folder,{withFileTypes:true})){const name=folder+'/'+entry.name;if(entry.isSymbolicLink())throw Error('Release inputs cannot be symlinks');if(entry.isDirectory())walk(name);else files.push(name);}}
 for(const folder of ['app/src','config','gradle/wrapper','scripts'])walk(folder);
 const hash=createHash('sha256');for(const file of files.sort()){const bytes=readFileSync(file);hash.update(file+'\0');hash.update(/\.(java|xml|gradle|json|properties|mjs|ps1)$/.test(file)?bytes.toString('utf8').replace(/\r\n/g,'\n'):bytes);hash.update('\0');}return hash.digest('hex');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(sourceFingerprint());
