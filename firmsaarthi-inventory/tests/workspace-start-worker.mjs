import {workerData,parentPort} from 'node:worker_threads';
import {openStock} from '../lib/stock.mjs';
import {startWorkspace} from '../lib/workspace-start.mjs';
import {d1Harness} from './d1-harness.mjs';
const sqlite=openStock(workerData.path);
try{
 const db=d1Harness(sqlite,{beforeBatch:async()=>{parentPort.postMessage({ready:true});await new Promise(resolve=>parentPort.once('message',resolve));}});
 const result=await startWorkspace(db,{userId:'synthetic-new-owner',siteId:'inventory-test'},'inventory-test',workerData.input);
 parentPort.postMessage({success:true,...result});
}catch(error){parentPort.postMessage({success:false,error:error.message,status:error.status});}finally{sqlite.close();}
