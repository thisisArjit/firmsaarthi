// @vitest-environment jsdom
import {afterEach,test,vi} from 'vitest';
import assert from 'node:assert/strict';
import {render,screen,waitFor,cleanup,act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TripsPanel from '../app/trips-panel';
import {browserFixture} from './helpers/browser';
import {WorkspaceStagePolicies} from '../lib/workspace-stage-policy';
import {TripStageDocuments} from '../lib/trip-stage-documents';
import {workspaceChanged} from '../lib/workspace-sync';

afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function fixture(optional=false){
 const f=await browserFixture();await f.seed();const booking=(await f.owner.state('2026-2027')).consignments[0],supplier=await f.owner.command('account.save',{kind:'supplier',code:'FILES-UI',name:'Synthetic private file carrier'});
 await new WorkspaceStagePolicies(f.owner).save({version:1,placement:optional?'optional':'accepted_file',loading:'accepted_file',arrival:'accepted_file'},0);
 const trip=await f.owner.command('trip.create',{consignmentId:booking.id,supplierId:supplier.id,registration:booking.truck,stagePolicy:'workspace_v1',stagePolicyVersion:1,requestId:'stage-documents-ui-trip'});
 const allocation=(await f.owner.first('SELECT id FROM trip_allocations WHERE trip_id=?',trip.id))!.id;
 const user=userEvent.setup(),view=render(<TripsPanel year="2026-2027" revision={0} onBill={()=>{}}/>);
 await user.click(await screen.findByRole('button',{name:'Open trip'}));await screen.findByText('No private stage files uploaded.');
 return {...f,trip,booking,allocation,user,view,pdf:()=>new f.DOMFile(['%PDF-1.4 synthetic stage UI only'],'Synthetic-stage.pdf',{type:'application/pdf'})};
}
const uploadCalls=(f:Awaited<ReturnType<typeof fixture>>)=>f.calls.filter(c=>c.path==='/api/tms/stage-documents'&&c.body?.get?.('file'));
const reviewCalls=(f:Awaited<ReturnType<typeof fixture>>)=>f.calls.filter(c=>c.path==='/api/tms/stage-reviews');
async function upload(f:Awaited<ReturnType<typeof fixture>>){await f.user.upload(screen.getByLabelText('Choose stage document'),f.pdf());await f.user.click(screen.getByRole('button',{name:'Upload stage document'}));await screen.findByText('Stage file uploaded. Owner review is still required.');await screen.findByRole('button',{name:'Review stage file Synthetic-stage.pdf'});}

test('actual owner upload remains private and requires manual acceptance before the physical step; dependencies protect corrections',async()=>{
 const f=await fixture();try{
  const before=JSON.stringify(await f.owner.financeReport('2026-2027'));await upload(f);
  assert.equal((screen.getByRole('button',{name:'Record placement'}) as HTMLButtonElement).disabled,true);
  const sent=uploadCalls(f)[0].body;assert.equal(sent.get('allocationId'),null);assert.equal(sent.get('stage'),'placement');assert.equal(sent.get('version'),'1');
  assert.ok(screen.getByRole('link',{name:'Download private stage file'}).getAttribute('href')!.includes('/api/tms/stage-documents?assetId='));
  await f.user.click(screen.getByRole('button',{name:'Review stage file Synthetic-stage.pdf'}));await f.user.type(screen.getByLabelText('Stage review reason'),'Synthetic owner checked the supplied file');await f.user.click(screen.getByRole('button',{name:'Save stage review'}));
  await screen.findByText('Stage file review saved. Physical progress remains a separate step.');await waitFor(()=>assert.equal((screen.getByRole('button',{name:'Record placement'}) as HTMLButtonElement).disabled,false));
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trip_events').get()!.n,0);
  await f.user.click(screen.getByRole('button',{name:'Record placement'}));await f.user.click(screen.getByRole('button',{name:'Save progress'}));await screen.findByRole('button',{name:'Record loading · '+f.booking.cn});
  await f.user.click(await screen.findByRole('button',{name:'Correct stage review Synthetic-stage.pdf'}));await f.user.type(screen.getByLabelText('Stage review reason'),'Synthetic correction must retain dependency history');await f.user.click(screen.getByRole('button',{name:'Save stage review'}));
  await screen.findByText(/Reverse dependent trip progress before correcting accepted evidence/);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM trip_stage_reviews WHERE kind='correction'").get()!.n,0);
  assert.equal(JSON.stringify(await f.owner.financeReport('2026-2027')),before);
 }finally{f.view.unmount();f.objects.clear();f.sqlite.close();}
});

test('camera upload keeps exact consignment scope and reject/correct/accept retains manual review history',async()=>{
 const f=await fixture();try{
  await f.user.selectOptions(screen.getByRole('combobox',{name:'Evidence stage'}),'loading');await f.user.selectOptions(screen.getByRole('combobox',{name:'Stage consignment'}),f.allocation);
  const camera=screen.getByLabelText('Take stage document photo');assert.equal(camera.getAttribute('capture'),'environment');assert.equal(camera.getAttribute('accept'),'image/png,image/jpeg');
  await f.user.upload(camera,new f.DOMFile([new Uint8Array([255,216,255,1,2,3])],'Synthetic-photo.jpg',{type:'image/jpeg'}));await f.user.click(screen.getByRole('button',{name:'Upload stage document'}));
  await f.user.click(await screen.findByRole('button',{name:'Review stage file Synthetic-photo.jpg'}));await f.user.selectOptions(screen.getByRole('combobox',{name:'Stage file decision'}),'reject');await f.user.click(screen.getByRole('button',{name:'Save stage review'}));assert.equal(reviewCalls(f).length,0);
  await f.user.type(screen.getByLabelText('Stage review reason'),'Synthetic photo is unreadable');await f.user.click(screen.getByRole('button',{name:'Save stage review'}));await screen.findByRole('button',{name:'Correct stage review Synthetic-photo.jpg'});
  const document=f.sqlite.prepare('SELECT * FROM trip_stage_documents').get()!;assert.equal(document.stage,'loading');assert.equal(document.allocation_id,f.allocation);
  await f.user.click(screen.getByRole('button',{name:'Correct stage review Synthetic-photo.jpg'}));await f.user.type(screen.getByLabelText('Stage review reason'),'Synthetic corrected review after checking source');await f.user.click(screen.getByRole('button',{name:'Save stage review'}));await screen.findByRole('button',{name:'Review stage file Synthetic-photo.jpg'});
  await f.user.click(screen.getByRole('button',{name:'Review stage file Synthetic-photo.jpg'}));await f.user.click(screen.getByRole('button',{name:'Save stage review'}));await screen.findByRole('button',{name:'Correct stage review Synthetic-photo.jpg'});
  assert.deepEqual(f.sqlite.prepare('SELECT kind FROM trip_stage_reviews ORDER BY trip_version').all().map((r:any)=>r.kind),['reject','correction','accept']);assert.ok(screen.getByText('Stage file review history (3)'));
 }finally{f.view.unmount();f.objects.clear();f.sqlite.close();}
});

test('a failed upload retains the file and original request through refresh and explicit latest-version review',async()=>{
 const f=await fixture(true),original=globalThis.fetch;let firstId='';try{
  await f.user.upload(screen.getByLabelText('Choose stage document'),f.pdf());let fail=true;
  globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{if(fail&&String(input)==='/api/tms/stage-documents'&&init?.method==='POST'){fail=false;firstId=String((init.body as FormData).get('requestId'));throw new Error('Synthetic temporary network failure');}return original(input,init);}) as typeof fetch;
  await f.user.click(screen.getByRole('button',{name:'Upload stage document'}));await screen.findByText(/Synthetic temporary network failure/);
  await f.owner.command('trip.event',{tripId:f.trip.id,kind:'placement',version:1,eventAt:new Date().toISOString(),requestId:'stage-files-external-placement'});workspaceChanged();
  const rebase=await screen.findByRole('button',{name:'Use latest trip version for upload'});await waitFor(()=>assert.equal((rebase as HTMLButtonElement).disabled,false));
  assert.equal((screen.getByRole('button',{name:'Upload stage document'}) as HTMLButtonElement).disabled,true);assert.ok(screen.getByText(/Selected: Synthetic-stage.pdf/));
  await f.user.click(rebase);await f.user.click(screen.getByRole('button',{name:'Upload stage document'}));await screen.findByText('Stage file uploaded. Owner review is still required.');
  assert.equal(uploadCalls(f)[0].body.get('requestId'),firstId);assert.equal(uploadCalls(f)[0].body.get('version'),'2');assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trip_stage_documents').get()!.n,1);
 }finally{globalThis.fetch=original;f.view.unmount();f.objects.clear();f.sqlite.close();}
});

test('an uncertain committed response retries the same canonical file without duplicating SQL or object storage',async()=>{
 const f=await fixture(),original=globalThis.fetch;try{
  let lose=true;globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{const response=await original(input,init);if(lose&&String(input)==='/api/tms/stage-documents'&&init?.method==='POST'&&response.ok){lose=false;throw new Error('Synthetic response lost after commit');}return response;}) as typeof fetch;
  await f.user.upload(screen.getByLabelText('Choose stage document'),f.pdf());await f.user.click(screen.getByRole('button',{name:'Upload stage document'}));await screen.findByText(/Synthetic response lost after commit/);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trip_stage_documents').get()!.n,1);
  await f.user.click(screen.getByRole('button',{name:'Upload stage document'}));await screen.findByText('Stage file uploaded. Owner review is still required.');
  const calls=uploadCalls(f);assert.equal(calls.length,2);assert.equal(calls[0].body.get('requestId'),calls[1].body.get('requestId'));assert.equal(f.objects.size,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM trip_stage_documents').get()!.n,1);
 }finally{globalThis.fetch=original;f.view.unmount();f.objects.clear();f.sqlite.close();}
});

test('review drafts retain their reason and exact decision through a concurrent upload and explicit rebase',async()=>{
 const f=await fixture();try{
  await upload(f);await f.user.click(screen.getByRole('button',{name:'Review stage file Synthetic-stage.pdf'}));await f.user.type(screen.getByLabelText('Stage review reason'),'Synthetic reason must survive a refresh');const actual=(screen.getByLabelText('Review actual time (IST)') as HTMLInputElement).value;
  await new TripStageDocuments(f.owner).upload({tripId:f.trip.id,stage:'placement',version:2,requestId:'stage-files-concurrent-upload'},{name:'Other synthetic.pdf',type:'application/pdf',bytes:new TextEncoder().encode('%PDF-1.4 other synthetic')},f.env.BUCKET);workspaceChanged();
  const rebase=await screen.findByRole('button',{name:'Use latest trip version for review'});await waitFor(()=>assert.equal((rebase as HTMLButtonElement).disabled,false));
  assert.equal((screen.getByLabelText('Stage review reason') as HTMLTextAreaElement).value,'Synthetic reason must survive a refresh');assert.equal((screen.getByLabelText('Review actual time (IST)') as HTMLInputElement).value,actual);
  await f.user.click(rebase);await f.user.click(screen.getByRole('button',{name:'Save stage review'}));await screen.findByText('Stage file review saved. Physical progress remains a separate step.');
  assert.equal(reviewCalls(f)[0].body.version,3);assert.equal(reviewCalls(f)[0].body.note,'Synthetic reason must survive a refresh');
 }finally{f.view.unmount();f.objects.clear();f.sqlite.close();}
});

test('losing owner access clears private snapshots and selections and ignores a delayed former-owner response',async()=>{
 const f=await fixture(),original=globalThis.fetch;let release:()=>Promise<void>=async()=>{};try{
  await upload(f);await f.user.upload(screen.getByLabelText('Choose stage document'),new f.DOMFile(['%PDF-1.4 private unfinished'],'Private-draft.pdf',{type:'application/pdf'}));
  let held=false;globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{if(!held&&String(input).startsWith('/api/tms/stage-documents?tripId=')){held=true;const response=original(input,init);return new Promise<Response>(resolve=>{release=async()=>resolve(await response);});}return original(input,init);}) as typeof fetch;
  workspaceChanged();await waitFor(()=>assert.equal(held,true));f.sqlite.prepare("UPDATE memberships SET role='MEMBER' WHERE user_id='api-owner'").run();workspaceChanged();
  await waitFor(()=>assert.equal(!!screen.queryByLabelText('Choose stage document'),false));await act(async()=>{await release();});
  assert.equal(screen.queryByRole('link',{name:'Download private stage file'}),null);assert.equal(screen.queryByText(/Private-draft.pdf/),null);assert.equal(screen.queryByRole('button',{name:'Review stage file Synthetic-stage.pdf'}),null);
 }finally{await release();globalThis.fetch=original;f.view.unmount();f.objects.clear();f.sqlite.close();}
});
