import {units,text,quantity,movementInput} from './domain.mjs';

// Trusted identity must come from Inventory's future authenticated membership boundary.
// This service never accepts org/user identities from an HTTP request body.
export class D1Stock {
 constructor(db,{orgId,userId}){
  this.db=db.withSession?db.withSession('first-primary'):db;
  this.org=text(orgId,'workspace ID');this.user=text(userId,'user ID');
 }
 q(sql,...args){return this.db.prepare(sql).bind(...args);}
 async access(owner=false){const row=await this.q('SELECT role FROM members WHERE org_id=? AND user_id=?',this.org,this.user).first();if(!['owner','operator','viewer'].includes(row?.role)||owner&&row.role!=='owner')throw Error(owner?'Owner permission required.':'Workspace access required.');return row.role;}
 async item({sku,name,unit}){
  sku=text(sku,'SKU',60).toUpperCase();name=text(name,'item name');if(!Object.hasOwn(units,unit))throw Error('Choose a supported base unit.');
  const id=crypto.randomUUID(),row=await this.q("INSERT INTO items(id,org_id,sku,name,unit) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM members WHERE org_id=? AND user_id=? AND role='owner') RETURNING id,sku,name,unit",id,this.org,sku,name,unit,this.org,this.user).first();
  if(!row)throw Error('Owner permission required.');return row;
 }
 async warehouse({code,name}){
  code=text(code,'warehouse code',40).toUpperCase();name=text(name,'warehouse name');
  const id=crypto.randomUUID(),row=await this.q("INSERT INTO warehouses(id,org_id,code,name) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM members WHERE org_id=? AND user_id=? AND role='owner') RETURNING id,code,name",id,this.org,code,name,this.org,this.user).first();
  if(!row)throw Error('Owner permission required.');return row;
 }
 async post(input){
  const {kind,requestId,reason,payload}=movementInput(input,await this.access());
  // Fast replay handles retired masters; batch read below rechecks current permissions.
  const old=await this.q('SELECT * FROM movements WHERE org_id=? AND request_id=?',this.org,requestId).first();
  let itemId,warehouseId,delta,reverses=null;
  if(old){itemId=old.item_id;warehouseId=old.warehouse_id;delta=old.delta;reverses=old.reverses;}
  else if(kind==='reverse'){
   const original=await this.q("SELECT * FROM movements WHERE org_id=? AND id=? AND kind<>'reverse'",this.org,text(input.reverses,'movement ID')).first();if(!original)throw Error('Movement unavailable.');
   itemId=original.item_id;warehouseId=original.warehouse_id;delta=-original.delta;reverses=original.id;
  }else{
   itemId=text(input.itemId,'item ID');warehouseId=text(input.warehouseId,'warehouse ID');
   const item=await this.q('SELECT unit FROM items WHERE org_id=? AND id=? AND active=1',this.org,itemId).first();if(!item)throw Error('Active item and warehouse required.');
   delta=quantity(input.quantity,item.unit)*(['issue','adjust_out'].includes(kind)?-1:1);
  }
  if(kind.startsWith('adjust')&&!Number.isSafeInteger(input.expectedVersion))throw Error('Stock changed. Review the latest balance before adjusting.');
  const id=crypto.randomUUID(),at=new Date().toISOString();
  // No BEGIN/COMMIT across HTTP round trips. D1 batch is one transaction; SQL triggers
  // validate the current role, balance/version, unit and reversal at the write itself.
  let results;
  try{results=await this.db.batch([
   this.q('INSERT INTO movements(id,org_id,item_id,warehouse_id,kind,delta,reason,request_id,payload,actor,recorded_at,reverses,expected_version) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM movements WHERE org_id=? AND request_id=?) RETURNING id',id,this.org,itemId,warehouseId,kind,delta,reason,requestId,payload,this.user,at,reverses,kind.startsWith('adjust')?input.expectedVersion:null,this.org,requestId),
   this.q("SELECT m.* FROM movements m JOIN members a ON a.org_id=m.org_id AND a.user_id=? WHERE m.org_id=? AND m.request_id=? AND (a.role='owner' OR (a.role='operator' AND m.kind IN ('receive','issue')))",this.user,this.org,requestId),
  ]);}catch(error){if(/CHECK constraint failed.*quantity/i.test(String(error)))throw Error(delta<0?'Insufficient stock.':'Stock exceeds the allowed range.');throw error;}
  const row=results[1].results?.[0];if(!row)throw Error('Stock permission required.');
  if(row.payload!==payload||row.actor!==this.user)throw Error('Request ID already used for another movement.');
  return {...row,...(results[0].results?.length?{}:{replayed:true})};
 }
 async state(){
  const permission="EXISTS(SELECT 1 FROM members WHERE org_id=? AND user_id=? AND role IN ('owner','operator','viewer'))";
  const rows=await this.db.batch([
   this.q('SELECT role FROM members WHERE org_id=? AND user_id=?',this.org,this.user),
   this.q(`SELECT id,sku,name,unit,active FROM items WHERE org_id=? AND ${permission} ORDER BY sku`,this.org,this.org,this.user),
   this.q(`SELECT id,code,name,active FROM warehouses WHERE org_id=? AND ${permission} ORDER BY code`,this.org,this.org,this.user),
   this.q(`SELECT item_id,warehouse_id,quantity,version FROM balances WHERE org_id=? AND ${permission} ORDER BY item_id,warehouse_id`,this.org,this.org,this.user),
  ]);if(!['owner','operator','viewer'].includes(rows[0].results?.[0]?.role))throw Error('Workspace access required.');
  return {items:rows[1].results,warehouses:rows[2].results,balances:rows[3].results};
 }
 async history(itemId,warehouseId,{after=0,limit=100}={}){
  text(itemId,'item ID');text(warehouseId,'warehouse ID');if(!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(limit)||limit<1||limit>200)throw Error('Invalid history page.');
  const rows=await this.db.batch([
   this.q('SELECT role FROM members WHERE org_id=? AND user_id=?',this.org,this.user),
   this.q("SELECT rowid AS sequence,id,kind,delta,reason,request_id,actor,recorded_at,reverses FROM movements WHERE org_id=? AND item_id=? AND warehouse_id=? AND rowid>? AND EXISTS(SELECT 1 FROM members WHERE org_id=? AND user_id=? AND role IN ('owner','operator','viewer')) ORDER BY rowid LIMIT ?",this.org,itemId,warehouseId,after,this.org,this.user,limit+1),
  ]);if(!['owner','operator','viewer'].includes(rows[0].results?.[0]?.role))throw Error('Workspace access required.');
  const records=rows[1].results.slice(0,limit);return {records,next:rows[1].results.length>limit?records.at(-1).sequence:null};
 }
}
