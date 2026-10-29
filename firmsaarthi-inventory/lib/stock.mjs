import {DatabaseSync} from 'node:sqlite';
import {migrateReference} from './migrations.mjs';
import {randomUUID} from 'node:crypto';
import {units,text,quantity,movementInput} from './domain.mjs';
export {units,quantity,displayQuantity} from './domain.mjs';
export function openStock(path=':memory:'){const db=new DatabaseSync(path);try{db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');migrateReference(db);return db;}catch(error){db.close();throw error;}}
// Bootstrap is for a future authenticated provisioning boundary, never an HTTP action accepting caller-selected identities.
export function provision(db,{orgId,userId,name}){text(orgId,'workspace ID');text(userId,'user ID');name=text(name,'business name');db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT INTO workspaces VALUES(?,?)').run(orgId,name);db.prepare("INSERT INTO members VALUES(?,?,'owner')").run(orgId,userId);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
export class Stock{
 constructor(db,{orgId,userId}){this.db=db;this.org=text(orgId,'workspace ID');this.user=text(userId,'user ID');}
 access(owner=false){const role=this.db.prepare('SELECT role FROM members WHERE org_id=? AND user_id=?').get(this.org,this.user)?.role;if(!['owner','operator','viewer'].includes(role)||owner&&role!=='owner')throw Error(owner?'Owner permission required.':'Workspace access required.');return role;}
 atomic(work){this.db.exec('BEGIN IMMEDIATE');try{const result=work();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 item({sku,name,unit}){return this.atomic(()=>{this.access(true);sku=text(sku,'SKU',60).toUpperCase();name=text(name,'item name');if(!Object.hasOwn(units,unit))throw Error('Choose a supported base unit.');const id=randomUUID();this.db.prepare('INSERT INTO items(id,org_id,sku,name,unit) VALUES(?,?,?,?,?)').run(id,this.org,sku,name,unit);return {id,sku,name,unit};});}
 warehouse({code,name}){return this.atomic(()=>{this.access(true);code=text(code,'warehouse code',40).toUpperCase();name=text(name,'warehouse name');const id=randomUUID();this.db.prepare('INSERT INTO warehouses(id,org_id,code,name) VALUES(?,?,?,?)').run(id,this.org,code,name);return {id,code,name};});}
 post(input){return this.atomic(()=>{
  const {kind,requestId,reason,payload}=movementInput(input,this.access());
  const replay=this.db.prepare('SELECT * FROM movements WHERE org_id=? AND request_id=?').get(this.org,requestId);if(replay){if(replay.payload!==payload||replay.actor!==this.user)throw Error('Request ID already used for another movement.');return {...replay,replayed:true};}
  let itemId,warehouseId,delta,reverses=null;
  if(kind==='reverse'){const original=this.db.prepare("SELECT * FROM movements WHERE org_id=? AND id=? AND kind<>'reverse'").get(this.org,text(input.reverses,'movement ID'));if(!original)throw Error('Movement unavailable.');itemId=original.item_id;warehouseId=original.warehouse_id;delta=-original.delta;reverses=original.id;}
  else{itemId=text(input.itemId,'item ID');warehouseId=text(input.warehouseId,'warehouse ID');const item=this.db.prepare('SELECT * FROM items WHERE org_id=? AND id=? AND active=1').get(this.org,itemId),warehouse=this.db.prepare('SELECT * FROM warehouses WHERE org_id=? AND id=? AND active=1').get(this.org,warehouseId);if(!item||!warehouse)throw Error('Active item and warehouse required.');delta=quantity(input.quantity,item.unit)*(['issue','adjust_out'].includes(kind)?-1:1);}
  const balance=this.db.prepare('SELECT * FROM balances WHERE org_id=? AND item_id=? AND warehouse_id=?').get(this.org,itemId,warehouseId)||{quantity:0,version:0};
  if(kind.startsWith('adjust')&&(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion!==balance.version))throw Error('Stock changed. Review the latest balance before adjusting.');
  if(balance.quantity+delta<0)throw Error('Insufficient stock.');if(balance.quantity+delta>9000000000000)throw Error('Stock exceeds the allowed range.');
  const id=randomUUID(),at=new Date().toISOString();this.db.prepare('INSERT INTO movements VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,this.org,itemId,warehouseId,kind,delta,reason,requestId,payload,this.user,at,reverses,kind.startsWith('adjust')?input.expectedVersion:null);return this.db.prepare('SELECT * FROM movements WHERE id=? AND org_id=?').get(id,this.org);
 });}
 state(){this.access();return {items:this.db.prepare('SELECT id,sku,name,unit,active FROM items WHERE org_id=? ORDER BY sku').all(this.org),warehouses:this.db.prepare('SELECT id,code,name,active FROM warehouses WHERE org_id=? ORDER BY code').all(this.org),balances:this.db.prepare('SELECT item_id,warehouse_id,quantity,version FROM balances WHERE org_id=? ORDER BY item_id,warehouse_id').all(this.org)};}
 history(itemId,warehouseId){this.access();text(itemId,'item ID');text(warehouseId,'warehouse ID');return this.db.prepare('SELECT id,kind,delta,reason,request_id,actor,recorded_at,reverses FROM movements WHERE org_id=? AND item_id=? AND warehouse_id=? ORDER BY rowid').all(this.org,itemId,warehouseId);}
}
