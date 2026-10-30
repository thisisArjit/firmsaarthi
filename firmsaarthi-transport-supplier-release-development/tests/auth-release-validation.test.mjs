import {test} from 'vitest';
import assert from 'node:assert/strict';
import {validateAuthRelease,requiredAuthScenarios} from '../lib/auth-release-validation.mjs';
// Pure in-memory unit data, not a hosted-evidence file or real Site identity.
function unitResults(){return ['desktop','phone'].flatMap(device=>requiredAuthScenarios.map(scenario=>({device,scenario,status:'passed',runner:'playwright',viewportMeasured:true,viewport:{width:device==='phone'?390:1280,height:device==='phone'?844:900}})));}
test('auth release requires every measured desktop/phone authentication scenario',()=>{assert.doesNotThrow(()=>validateAuthRelease(unitResults()));for(let i=0;i<6;i++)assert.throws(()=>validateAuthRelease(unitResults().filter((_,n)=>n!==i)));});
test('baseline-only, skipped, duplicate or non-browser results cannot qualify as auth acceptance',()=>{assert.throws(()=>validateAuthRelease([]));for(const status of ['skipped','failed','pending']){const r=unitResults();r[0].status=status;assert.throws(()=>validateAuthRelease(r));}const r=unitResults();assert.throws(()=>validateAuthRelease([...r,r[0]]));r[0].runner='unit';assert.throws(()=>validateAuthRelease(r));});
test('desktop relabelled as phone, missing measurements and invalid dimensions block authentication release',()=>{for(const change of [r=>{r.viewportMeasured=false;},r=>{r.viewport.width=1280;},r=>{r.viewport.height=0;},r=>{delete r.viewport;}]){const r=unitResults();change(r.find(v=>v.device==='phone'));assert.throws(()=>validateAuthRelease(r));}});
