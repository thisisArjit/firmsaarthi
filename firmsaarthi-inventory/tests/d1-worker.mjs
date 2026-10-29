import {workerData,parentPort} from 'node:worker_threads';
import {openStock} from '../lib/stock.mjs';
import {D1Stock} from '../lib/d1-stock.mjs';
import {d1Harness} from './d1-harness.mjs';
const sqlite=openStock(workerData.path);
try{
 const db=d1Harness(sqlite,{beforeBatch:async()=>{parentPort.postMessage({ready:true});await new Promise(resolve=>parentPort.once('message',resolve));}});
 const stock=new D1Stock(db,{orgId:'business-a',userId:'owner-a'});
 const result=await stock.post(workerData.input);parentPort.postMessage({success:true,id:result.id,replayed:!!result.replayed});
}catch(e){parentPort.postMessage({success:false,error:e.message});}finally{sqlite.close();}
