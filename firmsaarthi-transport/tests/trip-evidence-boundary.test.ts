import {test} from 'vitest';
import assert from 'node:assert/strict';
import {database} from './helpers/database';
import {TransportService} from '../lib/service';
import {OperationsService} from '../lib/operations-service';
import {TripService} from '../lib/trip-service';
import {TripDocuments} from '../lib/trip-documents';

test('operational completion and timeline POD cannot satisfy an owner-reviewed required trip file',async()=>{
  const {db,sqlite}=database(),owner=new TransportService(db,{userId:'evidence-boundary-owner',email:'owner@evidence.test'});
  const objects=new Map<string,Uint8Array>(),bucket={put:async(key:string,bytes:Uint8Array)=>{objects.set(key,bytes);},delete:async(key:string)=>{objects.delete(key);}} as unknown as R2Bucket;
  try{
    await owner.command('workspace.create',{name:'Synthetic evidence boundary'});
    const org=(await owner.member()).org_id,year='2026-2027';
    await owner.command('consignment.save',{year,cn:'EVIDENCE-1',date:'2026-10-26',company:'Synthetic customer',truck:'BR01AB1234',origin:'Patna',destination:'Delhi',freight:'1000',advance:'0'});
    const c=(await owner.state(year)).consignments[0],supplier=await owner.command('account.save',{kind:'supplier',code:'EVIDENCE-CARRIER',name:'Synthetic carrier'});
    const invoice=await owner.command('invoice.create',{year,date:'2026-10-27',ids:[c.id],taxMode:'none'}),snapshot=(await owner.owned('invoices',invoice.id,org)).snapshot,profit=(await owner.financeReport(year)).report.netProfit;
    const trip=await owner.command('trip.create',{consignmentId:c.id,supplierId:supplier.id,registration:c.truck,podPolicy:'file_v1',requestId:'evidence-boundary-trip'}),trips=new TripService(owner),ops=new OperationsService(owner);
    let counter=0;
    async function event(kind:string,extra:Record<string,unknown>={}){const state=await trips.detail(trip.id);return owner.command('trip.event',{tripId:trip.id,version:state.trip.version,kind,eventAt:new Date().toISOString(),requestId:'evidence-boundary-event-'+(++counter),...extra});}
    await ops.command('status.bulk',{items:[{id:c.id,version:c.stage_version}],stage:'complete',requestId:'evidence-boundary-status'});
    assert.equal((await ops.detail(c.id)).consignment.stage_status,'complete');
    let state=await trips.detail(trip.id);
    assert.equal(state.status,'planned');assert.equal(state.delivered,0);assert.equal(state.requiredPodRemaining,1);assert.equal(state.readyToClose,false);
    await event('dispatch');state=await trips.detail(trip.id);const allocationId=state.items[0].id;
    await event('delivery',{allocationId,reference:'Synthetic receiver'});
    const current=(await ops.rows()).find(row=>row.id===c.id)!,file={name:'Synthetic-POD.pdf',type:'application/pdf',bytes:new TextEncoder().encode('%PDF-1.4 synthetic identical evidence bytes')};
    const operational=await ops.upload({id:c.id,version:current.stage_version,category:'pod',remark:'Operational document, not owner-reviewed trip evidence',requestId:'evidence-boundary-operational'},file,bucket);
    state=await trips.detail(trip.id);
    assert.equal(state.documents.length,0);assert.equal(state.requiredPodRemaining,1);assert.equal((await trips.state()).ready.length,0);
    await assert.rejects(event('pod_accept',{allocationId,documentId:operational.id,reference:'Attempt to reuse timeline file'}),/belonging/);
    await assert.rejects(event('close'),/Accept an uploaded POD file/);
    assert.equal((await trips.detail(trip.id)).trip.version,state.trip.version);
    // Even identical bytes need a separate, correctly scoped private file and explicit owner review.
    const privateFile=await new TripDocuments(owner).upload({tripId:trip.id,allocationId,version:state.trip.version,requestId:'evidence-boundary-private'},file,bucket);
    assert.equal(objects.size,2);assert.equal((await trips.detail(trip.id)).requiredPodRemaining,1);
    await event('pod_accept',{allocationId,documentId:privateFile.id,reference:'Owner reviewed correct trip evidence'});
    assert.equal((await trips.detail(trip.id)).requiredPodRemaining,0);
    await event('close');assert.equal((await trips.detail(trip.id)).status,'closed');
    assert.equal((await owner.owned('invoices',invoice.id,org)).snapshot,snapshot);assert.equal((await owner.financeReport(year)).report.netProfit,profit);
    for(const table of ['invoice_receipts','supplier_payments'])assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM '+table).get()!.n,0);
  }finally{objects.clear();sqlite.close();}
});
