import {createInterface} from 'node:readline';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
if(process.stdin.isTTY)process.stdin.setRawMode(true);console.log('Ready for hidden synthetic fixture configuration.');
const input=await new Promise(resolve=>{const l=createInterface({input:process.stdin,terminal:false});l.once('line',s=>{l.close();resolve(JSON.parse(s));});}),origin='https://firmsaarthi-transport-staging.arjit-tiwari-ece14.chatgpt.site';
assert.equal(input.origin,origin);assert.ok(input.token&&input.password.length>=32&&/^[a-f0-9]{8}$/.test(input.fixtureSuffix));
const headers={'OAI-Sites-Authorization':'Bearer '+input.token,'Content-Type':'application/json',Origin:origin},release=await(await fetch(origin+'/api/release',{headers})).json();assert.equal(release.environment,'staging');assert.equal(release.fingerprint,'60888685a0db3cd76c08d3030ac36c3853eb54593f94dc204944b10291d397b2');
const fixtures=[];for(const device of ['desktop','phone']){const suffix=input.fixtureSuffix+'-'+device;
 const slots=[['supplier-'+device,`Synthetic supplier ${device} ${suffix}`,'supplier'],['transporter-'+device,'Synthetic transporter '+suffix,'transporter'],['supplier-other-'+device,'Synthetic other supplier','supplier'],['freshness-supplier-'+device,`Synthetic freshness ${device} ${suffix}`,'supplier'],['freshness-reader-'+device,'Synthetic freshness reader','transporter'],['readiness-'+device,`Synthetic readiness ${device} ${suffix}`,'supplier'],['export-'+device,'Synthetic private export '+suffix,'supplier'],['export-other','Synthetic export other '+suffix,'transporter'],['removal-'+device,'Synthetic removal '+suffix,'supplier'],['editor-'+device,'Synthetic editor '+suffix,'supplier'],['directory-supplement-'+device,'Synthetic directory supplement','transporter']];
 for(const [slot,businessName,businessKind] of slots)fixtures.push({slot,device,email:`${slot}-${suffix}@staging.test`,businessName,businessKind});
}
fixtures.push({slot:'admin',device:'operator',email:`supplier-release-admin-${input.fixtureSuffix}@staging.test`,businessName:'Synthetic Supplier release operator',businessKind:'transporter'});
for(const device of ['desktop','phone'])fixtures.push({slot:'payment-'+device,device,email:`supplier-payment-${device}-${input.fixtureSuffix}@staging.test`,businessName:'Synthetic payment release '+device,businessKind:'transporter'});
const completed=[];try{for(const f of fixtures){const r=await fetch(origin+'/api/auth',{method:'POST',headers,body:JSON.stringify({action:'signup',email:f.email,password:input.password,businessName:f.businessName,businessKind:f.businessKind})});assert.equal(r.status,200,`Synthetic fixture creation failed at ${f.slot}/${f.device}: HTTP${r.status}`);completed.push(f);console.log('Prepared synthetic fixture '+f.slot+'/'+f.device);}
 writeFileSync('outputs/supplier-fixture-manifest.json',JSON.stringify({environment:'staging',origin,fixtureSuffix:input.fixtureSuffix,preparedAgainstFingerprint:release.fingerprint,fixtures:completed},null,2));
 console.log('Prepared '+completed.length+' empty synthetic workspaces using the existing legitimate staging signup. This is fixture setup, not secured-signup evidence.');
}catch(e){console.error(String(e).replaceAll(input.password,'[redacted]').replaceAll(input.token,'[redacted]'));process.exitCode=1;}
