// @vitest-environment jsdom
import {afterEach,test,vi} from 'vitest';
import assert from 'node:assert/strict';
import {render,screen,waitFor,cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {browserFixture} from './helpers/browser';
import ConsignmentTimeline from '../app/consignment-timeline';
import {OperationsService} from '../lib/operations-service';
import {workspaceChanged} from '../lib/workspace-sync';

afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
test('a selected document survives a newer consignment revision and uploads only after explicit review',async()=>{
 const f=await browserFixture(),user=userEvent.setup();await f.seed();const booking=(await f.owner.state('2026-2027')).consignments[0],ops=new OperationsService(f.owner),view=render(<ConsignmentTimeline initialId={booking.id}/>);
 try{
  const input=await screen.findByLabelText('Choose consignment document');
  await user.selectOptions(screen.getByLabelText('Category'),'pod');
  await user.type(screen.getByLabelText('What is this document? (optional)'),'Synthetic signed receipt');
  await user.upload(input,new f.DOMFile(['%PDF-1.4 Synthetic test only'],'Synthetic-review.pdf',{type:'application/pdf'}));
  await ops.command('activity.add',{id:booking.id,version:booking.stage_version,kind:'note',note:'Synthetic concurrent update',requestId:'upload-review-concurrent-note'});
  workspaceChanged();
  const review=await screen.findByRole('button',{name:'Use latest status for upload'});
  assert.ok(screen.getByText('Synthetic-review.pdf · 1 KB'));
  assert.equal((screen.getByLabelText('What is this document? (optional)') as HTMLInputElement).value,'Synthetic signed receipt');
  const upload=screen.getByRole('button',{name:'Upload document'});assert.equal((upload as HTMLButtonElement).disabled,true);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM consignment_files').get()!.n,0);
  await user.click(review);await user.click(upload);
  await screen.findByText('Document uploaded.');
  await waitFor(()=>assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM consignment_files').get()!.n,1));
  const call=f.calls.find(c=>c.body?.get?.('file'));assert.ok(call);assert.equal(call.body.get('version'),String(Number(booking.stage_version)+1));
  const retry=new window.FormData();for(const [key,value] of call.body.entries())if(key!=='file')retry.set(key,String(value));retry.set('file',new f.DOMFile(['%PDF-1.4 Synthetic test only'],'Synthetic-review.pdf',{type:'application/pdf'}));const response=await fetch(call.path,{method:'POST',body:retry});assert.equal(response.status,200);assert.equal(((await response.json()) as {alreadyRecorded:boolean}).alreadyRecorded,true);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM consignment_files').get()!.n,1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM invoice_receipts').get()!.n,0);
 }finally{view.unmount();f.sqlite.close();}
});
