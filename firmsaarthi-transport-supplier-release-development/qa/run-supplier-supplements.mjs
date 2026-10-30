import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
if(process.stdin.isTTY)process.stdin.setRawMode(true);console.log('Ready for hidden Supplier supplemental configuration.');
const input=await new Promise(resolve=>{const r=createInterface({input:process.stdin,terminal:false});r.once('line',s=>{r.close();resolve(JSON.parse(s));});});
for(const name of ['check-supplier-directory-freshness','check-supplier-readiness','check-supplier-export','check-supplier-removal','check-supplier-directory-ui']){
 const code=await new Promise(resolve=>{const child=spawn(process.execPath,['outputs/'+name+'.mjs'],{stdio:['pipe','inherit','inherit'],windowsHide:true});child.once('error',()=>resolve(-1));child.once('exit',resolve);child.stdin.end(JSON.stringify(input)+'\n');});
 if(code!==0){console.log('Stopped after failed Supplier supplemental runner: '+name);process.exitCode=1;break;}
}
