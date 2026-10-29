// @vitest-environment jsdom
import {afterEach,test,vi} from 'vitest';
import assert from 'node:assert/strict';
import {render,screen,waitFor,cleanup,act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {browserFixture} from './helpers/browser';
import StagePolicyPanel from '../app/stage-policy-panel';
import TripsPanel from '../app/trips-panel';
import {WorkspaceStagePolicies} from '../lib/workspace-stage-policy';
import {WorkspacePodPolicies} from '../lib/workspace-pod-policy';
import {workspaceChanged} from '../lib/workspace-sync';
const optional={version:1,placement:'optional',loading:'optional',arrival:'optional'},required={version:1,placement:'accepted_file',loading:'accepted_file',arrival:'accepted_file'};
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});

test('Settings enables real stage requirements and preserves edits across external default refresh',async()=>{
 const f=await browserFixture(),user=userEvent.setup(),view=render(<StagePolicyPanel/>);try{const placement=await screen.findByLabelText('Placement file');await user.selectOptions(placement,'accepted_file');await user.click(screen.getByRole('button',{name:'Enable stage tracking'}));await screen.findByText('Stage requirements saved for new timelines. Existing timelines keep their requirements.');assert.equal(f.sqlite.prepare('SELECT placement_rule FROM workspace_stage_policies WHERE version=1').get()!.placement_rule,'accepted_file');await user.selectOptions(placement,'optional');await new WorkspaceStagePolicies(f.owner).save(required,1);await act(async()=>workspaceChanged());await screen.findByText(/Stage requirements changed elsewhere/);assert.equal((placement as unknown as HTMLSelectElement).value,'optional');assert.equal((screen.getByRole('button',{name:'Save stage requirements'}) as HTMLButtonElement).disabled,true);await user.click(screen.getByRole('button',{name:'Discard stage draft and reload'}));await waitFor(()=>assert.equal((placement as unknown as HTMLSelectElement).value,'accepted_file'));assert.equal(screen.queryByText(/Stage requirements changed elsewhere/),null);
 }finally{view.unmount();f.objects.clear();f.sqlite.close();}
});

test('Settings stale-save rejection fetches the new revision while retaining the unsaved selections',async()=>{
 const f=await browserFixture();await new WorkspaceStagePolicies(f.owner).save(optional,0);const user=userEvent.setup(),view=render(<StagePolicyPanel/>);try{const placement=await screen.findByLabelText('Placement file');await user.selectOptions(placement,'accepted_file');await new WorkspaceStagePolicies(f.owner).save({...optional,loading:'accepted_file'},1);await user.click(screen.getByRole('button',{name:'Save stage requirements'}));await screen.findByText(/Stage requirements changed elsewhere/);assert.equal((placement as unknown as HTMLSelectElement).value,'accepted_file');assert.equal((screen.getByLabelText('Loading file per consignment') as unknown as HTMLSelectElement).value,'optional');assert.equal(f.sqlite.prepare('SELECT MAX(version) n FROM workspace_stage_policies').get()!.n,2);assert.equal((screen.getByRole('button',{name:'Save stage requirements'}) as HTMLButtonElement).disabled,true);
 }finally{view.unmount();f.objects.clear();f.sqlite.close();}
});

test('non-owner Settings show requirements without editable controls or policy history',async()=>{
 const f=await browserFixture();await new WorkspaceStagePolicies(f.owner).save(required,0);f.sqlite.prepare("UPDATE memberships SET role='MEMBER' WHERE user_id='api-owner'").run();const view=render(<StagePolicyPanel/>);try{await screen.findByText('Only the workspace owner can change these requirements.');assert.equal(screen.queryByLabelText('Placement file'),null);assert.equal(screen.queryByRole('button',{name:'Save stage requirements'}),null);assert.equal(screen.queryByText('Previous stage requirements'),null);
 }finally{view.unmount();f.objects.clear();f.sqlite.close();}
});

test('first enable attempt retains its optional draft when another device configures requirements first',async()=>{
 const f=await browserFixture(),user=userEvent.setup(),view=render(<StagePolicyPanel/>);try{await screen.findByRole('button',{name:'Enable stage tracking'});await new WorkspaceStagePolicies(f.owner).save(required,0);await user.click(screen.getByRole('button',{name:'Enable stage tracking'}));await screen.findByText(/Stage requirements changed elsewhere/);assert.equal((screen.getByLabelText('Placement file') as unknown as HTMLSelectElement).value,'optional');assert.equal((screen.getByRole('button',{name:'Save stage requirements'}) as HTMLButtonElement).disabled,true);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM workspace_stage_policies').get()!.n,1);
 }finally{view.unmount();f.objects.clear();f.sqlite.close();}
});

async function planningFixture(){const f=await browserFixture();await f.seed();const supplier=await f.owner.command('account.save',{kind:'supplier',code:'STAGE-UI',name:'Synthetic stage UI carrier'}),booking=(await f.owner.state('2026-2027')).consignments[0];return {...f,supplier,booking};}
async function choose(user:ReturnType<typeof userEvent.setup>,f:Awaited<ReturnType<typeof planningFixture>>){await user.click(await screen.findByRole('button',{name:'Track consignment'}));await user.selectOptions(screen.getByLabelText('Consignment / trip ID *'),f.booking.id);await user.selectOptions(screen.getByLabelText('Supplier account *'),f.supplier.id);}

test('planning inherits the reviewed stage revision into an immutable timeline',async()=>{
 const f=await planningFixture();await new WorkspaceStagePolicies(f.owner).save(optional,0);const user=userEvent.setup(),view=render(<TripsPanel year="2026-2027" revision={0} onBill={()=>{}}/>);try{await choose(user,f);assert.ok(screen.getByRole('region',{name:'Timeline stage requirements'}));await user.click(screen.getByRole('button',{name:'Start trip tracking'}));await waitFor(()=>assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trips').get()!.n,1));const saved=JSON.parse(String(f.sqlite.prepare('SELECT creation_payload FROM trips').get()!.creation_payload));assert.equal(saved.stagePolicyRequest.contract,'workspace_stage_v1');assert.equal(saved.stagePolicyRequest.version,1);assert.deepEqual(saved.stagePolicySnapshot.policy,optional);
 }finally{view.unmount();f.objects.clear();f.sqlite.close();}
});

test('planning refresh requires stage review and preserves supplier, consignment and reasoned POD choices',async()=>{
 const f=await planningFixture();await new WorkspaceStagePolicies(f.owner).save(optional,0);await new WorkspacePodPolicies(f.owner).save('file_v1',0);const user=userEvent.setup(),view=render(<TripsPanel year="2026-2027" revision={0} onBill={()=>{}}/>);try{await choose(user,f);await user.selectOptions(screen.getByLabelText('POD requirement'),'reference_v1');await user.type(screen.getByLabelText('Reason for using optional POD files *'),'Signed paper accepted by owner');await new WorkspaceStagePolicies(f.owner).save(required,1);await act(async()=>workspaceChanged());await screen.findByText(/Stage requirements changed while this form was open/);assert.equal((screen.getByRole('button',{name:'Start trip tracking'}) as HTMLButtonElement).disabled,true);assert.equal((screen.getByLabelText('Supplier account *') as unknown as HTMLSelectElement).value,f.supplier.id);assert.equal((screen.getByLabelText('Consignment / trip ID *') as unknown as HTMLSelectElement).value,f.booking.id);await user.click(screen.getByRole('button',{name:'Use latest stage requirements'}));assert.equal((screen.getByLabelText('Reason for using optional POD files *') as unknown as HTMLTextAreaElement).value,'Signed paper accepted by owner');assert.equal((screen.getByLabelText('POD requirement') as unknown as HTMLSelectElement).value,'reference_v1');await user.click(screen.getByRole('button',{name:'Start trip tracking'}));await waitFor(()=>assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trips').get()!.n,1));const saved=JSON.parse(String(f.sqlite.prepare('SELECT creation_payload FROM trips').get()!.creation_payload));assert.equal(saved.stagePolicyRequest.version,2);assert.equal(saved.podPolicyRequest.reason,'Signed paper accepted by owner');assert.deepEqual(saved.stagePolicySnapshot.policy,required);
 }finally{view.unmount();f.objects.clear();f.sqlite.close();}
});

test('a newly configured default cannot silently opt an already-open planning draft into stages',async()=>{
 const f=await planningFixture(),user=userEvent.setup(),view=render(<TripsPanel year="2026-2027" revision={0} onBill={()=>{}}/>);try{await choose(user,f);assert.equal(screen.queryByRole('region',{name:'Timeline stage requirements'}),null);await new WorkspaceStagePolicies(f.owner).save(optional,0);await act(async()=>workspaceChanged());await screen.findByText(/Stage requirements changed while this form was open/);assert.equal((screen.getByRole('button',{name:'Start trip tracking'}) as HTMLButtonElement).disabled,true);await user.click(screen.getByRole('button',{name:'Use latest stage requirements'}));assert.equal((screen.getByLabelText('Consignment / trip ID *') as unknown as HTMLSelectElement).value,f.booking.id);assert.equal((screen.getByLabelText('Supplier account *') as unknown as HTMLSelectElement).value,f.supplier.id);await user.click(screen.getByRole('button',{name:'Start trip tracking'}));await waitFor(()=>assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trips').get()!.n,1));assert.equal(JSON.parse(String(f.sqlite.prepare('SELECT creation_payload FROM trips').get()!.creation_payload)).stagePolicyRequest.version,1);
 }finally{view.unmount();f.objects.clear();f.sqlite.close();}
});

test('server-side default races refresh planning without discarding the draft or changing request identity',async()=>{
 const f=await planningFixture();await new WorkspaceStagePolicies(f.owner).save(optional,0);const user=userEvent.setup(),view=render(<TripsPanel year="2026-2027" revision={0} onBill={()=>{}}/>);try{await choose(user,f);await new WorkspaceStagePolicies(f.owner).save(required,1);await user.click(screen.getByRole('button',{name:'Start trip tracking'}));await screen.findByText(/Stage requirements changed while this form was open/);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trips').get()!.n,0);assert.equal((screen.getByLabelText('Supplier account *') as unknown as HTMLSelectElement).value,f.supplier.id);await user.click(screen.getByRole('button',{name:'Use latest stage requirements'}));await user.click(screen.getByRole('button',{name:'Start trip tracking'}));await waitFor(()=>assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trips').get()!.n,1));const requests=f.calls.filter(c=>c.body?.action==='trip.create').map(c=>c.body.data);assert.equal(requests.length,2);assert.equal(requests[0].requestId,requests[1].requestId);assert.equal(requests[0].stagePolicyVersion,1);assert.equal(requests[1].stagePolicyVersion,2);
 }finally{view.unmount();f.objects.clear();f.sqlite.close();}
});
