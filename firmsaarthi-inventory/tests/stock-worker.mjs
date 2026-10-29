import {workerData,parentPort} from 'node:worker_threads';
import {openStock,Stock} from '../lib/stock.mjs';
const db=openStock(workerData.path);try{new Stock(db,{orgId:'business-a',userId:'owner-a'}).post({kind:'issue',quantity:'7',itemId:workerData.itemId,warehouseId:workerData.warehouseId,requestId:workerData.id,reason:'Concurrent synthetic issue'});parentPort.postMessage({success:true});}catch(e){parentPort.postMessage({success:false,error:e.message});}finally{db.close();}
