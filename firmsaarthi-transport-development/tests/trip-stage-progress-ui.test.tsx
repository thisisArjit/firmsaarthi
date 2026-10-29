// @vitest-environment jsdom
import {afterEach,test,vi} from 'vitest';
import assert from 'node:assert/strict';
import {render,screen,waitFor,cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {browserFixture} from './helpers/browser';
import TripsPanel from '../app/trips-panel';
import TripStageProgress from '../app/trip-stage-progress';
import {WorkspaceStagePolicies} from '../lib/workspace-stage-policy';
import {TripStageDocuments} from '../lib/trip-stage-documents';
import {TripStageReviews} from '../lib/trip-stage-reviews';
import {tripStageSummary} from '../lib/trip-stage-summary';
import {workspaceChanged} from '../lib/workspace-sync';

afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function fixture(strict=false){
 const f=await browserFixture();await f.seed();
 const supplier=await f.owner.command('account.save',{kind:'supplier',code:'STAGE-UI',name:'Synthetic stage carrier'});
 await new WorkspaceStagePolicies(f.owner).save({version:1,placement:strict?'accepted_file':'optional',loading:'optional',arrival:'optional'},0);
 const c=(await f.owner.state('2026-2027')).consignments[0];
 const trip=await f.owner.command('trip.create',{consignmentId:c.id,supplierId:supplier.id,registration:c.truck,stagePolicy:'workspace_v1',stagePolicyVersion:1,requestId:'stage-progress-ui-trip'});
 const user=userEvent.setup(),view=render(<TripsPanel year="2026-2027" revision={0} onBill={()=>{}}/>);
 await user.click(await screen.findByRole('button',{name:'Open trip'}));await screen.findByRole('region',{name:'Physical stage progress'});
 return {...f,user,view,trip,booking:c};
}

test('optional stages remain physical milestones and actual UI traverses placement to delivery without changing finance',async()=>{
 const f=await fixture();try{
  const before=JSON.stringify(await f.owner.financeReport('2026-2027'));
  assert.equal(screen.queryByRole('button',{name:'Record departure'}),null);
  for(const name of ['Record placement','Record loading · '+f.booking.cn,'Record departure','Record arrival · '+f.booking.cn,'Record delivery · '+f.booking.cn]){
   await f.user.click(await screen.findByRole('button',{name}));
   if(name.startsWith('Record delivery'))await f.user.type(screen.getByLabelText('Delivery / receiver reference'),'Synthetic receiver confirmation');
   await f.user.click(screen.getByRole('button',{name:'Save progress'}));
   await waitFor(()=>assert.equal(screen.queryByRole('button',{name:'Save progress'}),null));
  }
  assert.deepEqual(f.sqlite.prepare('SELECT kind FROM trip_events ORDER BY version').all().map((r:any)=>r.kind),['placement','loading','dispatch','arrival','delivery']);
  assert.equal(f.sqlite.prepare('SELECT stage_status FROM consignments WHERE cn=?').get(f.booking.cn)!.stage_status,'complete');
  assert.equal(JSON.stringify(await f.owner.financeReport('2026-2027')),before);
  assert.ok(screen.getByRole('button',{name:'Review POD '+f.booking.cn}));
  assert.ok(screen.getAllByText('Recorded manually').length>=4);
  await f.user.click(screen.getAllByText('Recorded manually')[0]);
  assert.ok(screen.getAllByText(/Actual \(IST\):/).length);
  assert.ok(screen.getAllByText(/Recorded \(IST\):/).length);
 }finally{f.view.unmount();f.objects.clear();f.sqlite.close();}
});

test('required stage evidence blocks action until actual owner acceptance and retains the saved policy revision',async()=>{
 const f=await fixture(true);try{
  const button=await screen.findByRole('button',{name:'Record placement'});assert.equal((button as HTMLButtonElement).disabled,true);
  await f.user.click(button);assert.equal(screen.queryByRole('button',{name:'Save progress'}),null);
  assert.ok(screen.getByText(/Owner-accepted placement file required/));
  const uploaded=await new TripStageDocuments(f.owner).upload({tripId:f.trip.id,stage:'placement',version:1,requestId:'stage-ui-private-file'},{name:'Private synthetic placement.pdf',type:'application/pdf',bytes:new TextEncoder().encode('%PDF-1.4 synthetic stage UI')},f.env.BUCKET);
  await new TripStageReviews(f.owner).record({tripId:f.trip.id,documentId:uploaded.id,kind:'accept',version:2,eventAt:new Date().toISOString(),note:'',requestId:'stage-ui-accept-file'});
  await new WorkspaceStagePolicies(f.owner).save({version:1,placement:'optional',loading:'optional',arrival:'optional'},1);
  workspaceChanged();await waitFor(()=>assert.equal((screen.getByRole('button',{name:'Record placement'}) as HTMLButtonElement).disabled,false));
  assert.ok(screen.getByText(/Saved requirements · revision 1/));
  assert.equal(screen.queryByText('Private synthetic placement.pdf'),null);
  await f.user.click(screen.getByRole('button',{name:'Record placement'}));await f.user.click(screen.getByRole('button',{name:'Save progress'}));
  await screen.findByRole('button',{name:'Record loading · '+f.booking.cn});
  const call=f.calls.find(c=>c.body?.action==='trip.event');assert.equal(call!.body.data.version,3);assert.equal(call!.body.data.documentId,null);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM trip_events WHERE kind='placement'").get()!.n,1);
 }finally{f.view.unmount();f.objects.clear();f.sqlite.close();}
});

test('a background milestone does not overwrite an unfinished event draft and stale save remains explicit',async()=>{
 const f=await fixture();try{
  await f.user.click(await screen.findByRole('button',{name:'Record placement'}));await f.user.type(screen.getByLabelText('Note (optional)'),'Preserve this draft across refresh');
  await f.owner.command('trip.event',{tripId:f.trip.id,kind:'placement',version:1,eventAt:new Date().toISOString(),requestId:'other-device-placement'});
  workspaceChanged();await screen.findByRole('button',{name:'Record loading · '+f.booking.cn});
  assert.equal((screen.getByLabelText('Note (optional)') as HTMLInputElement).value,'Preserve this draft across refresh');
  assert.equal((screen.getByRole('button',{name:'Record loading · '+f.booking.cn}) as HTMLButtonElement).disabled,true);
  await f.user.click(screen.getByRole('button',{name:'Save progress'}));await screen.findByRole('alert');
  assert.equal((screen.getByLabelText('Note (optional)') as HTMLInputElement).value,'Preserve this draft across refresh');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM trip_events WHERE kind='placement'").get()!.n,1);
  assert.equal(f.calls.filter(c=>c.body?.action==='trip.event').at(-1)!.body.data.version,1);
 }finally{f.view.unmount();f.objects.clear();f.sqlite.close();}
});

test('partial allocation controls carry exact allocation scope, explain owner gates and disappear for terminal trips',async()=>{
 const trip={id:'trip',org_id:'org',status:'dispatched',creation_payload:JSON.stringify({stagePolicyRequest:{contract:'workspace_stage_v1',version:1},stagePolicySnapshot:{version:1,policy:{version:1,placement:'optional',loading:'optional',arrival:'accepted_file'}}})};
 const allocations=[{id:'a',active:1,snapshot:{cn:'ONE'}},{id:'b',active:1,snapshot:{cn:'TWO'}}],events=[{id:'arrived-a',org_id:'org',trip_id:'trip',kind:'arrival',allocation_id:'a',event_at:'2026-10-27T00:00:00Z',recorded_at:'2026-10-27T00:01:00Z'}];
 const onStart=vi.fn(),summary=tripStageSummary(trip,allocations,events,[])!,user=userEvent.setup(),view=render(<TripStageProgress summary={summary} items={allocations} busy={false} owner={false} onStart={onStart}/>);
 await user.click(screen.getByRole('button',{name:'Record delivery · ONE'}));assert.equal(onStart.mock.calls[0][0].allocationId,'a');
 assert.equal((screen.getByRole('button',{name:'Record arrival · TWO'}) as HTMLButtonElement).disabled,true);
 assert.ok(screen.getByText(/Ask the workspace owner to upload and review/));
 view.rerender(<TripStageProgress summary={summary} items={allocations} busy owner={false} onStart={onStart}/>);
 assert.equal((screen.getByRole('button',{name:'Record delivery · ONE'}) as HTMLButtonElement).disabled,true);
 view.rerender(<TripStageProgress summary={tripStageSummary({...trip,status:'closed'},allocations,events,[])!} items={allocations} busy={false} owner={false} onStart={onStart}/>);
 assert.equal(screen.queryByRole('button',{name:/Record (arrival|delivery)/}),null);
 assert.equal(screen.queryByRole('heading',{name:'Next step'}),null);
 assert.ok(screen.getByText('ONE'));assert.ok(screen.getByText('TWO'));
});
