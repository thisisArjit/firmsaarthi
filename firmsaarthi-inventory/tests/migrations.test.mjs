import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,writeFileSync,copyFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {migrateReference} from '../lib/migrations.mjs';
import {openStock,provision,Stock} from '../lib/stock.mjs';
function temporary(work){const directory=mkdtempSync(join(tmpdir(),'firmsaarthi-migrations-'));try{return work(directory,pathToFileURL(directory+sep));}finally{assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));rmSync(directory,{recursive:true,force:true});}}
const database=()=>{const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');return db;};
test('versioned fresh schema reopens without changing stock, posted history or migration timestamps',()=>temporary(directory=>{
 const path=join(directory,'synthetic.db');let db=openStock(path);provision(db,{orgId:'a',userId:'owner',name:'Synthetic'});const stock=new Stock(db,{orgId:'a',userId:'owner'}),item=stock.item({sku:'A',name:'Goods',unit:'each'}),warehouse=stock.warehouse({code:'MAIN',name:'Main'});
 stock.post({kind:'receive',itemId:item.id,warehouseId:warehouse.id,quantity:'3',reason:'Test',requestId:'receive-001'});
 const prior=db.prepare('SELECT * FROM movements').all(),migration=db.prepare('SELECT * FROM inventory_reference_migrations').all();db.close();db=openStock(path);
 try{assert.deepEqual(db.prepare('SELECT * FROM movements').all(),prior);assert.deepEqual(db.prepare('SELECT * FROM inventory_reference_migrations').all(),migration);assert.equal(db.prepare('SELECT quantity FROM balances').get().quantity,3000000);assert.deepEqual(migrateReference(db),[]);}finally{db.close();}
}));
test('unversioned bootstrap databases are rejected without adopting or modifying existing records',()=>{
 const db=database();try{db.exec(readFileSync(new URL('../lib/schema.sql',import.meta.url),'utf8'));db.prepare('INSERT INTO workspaces VALUES(?,?)').run('old','Synthetic old');const before=db.prepare('SELECT total_changes() n').get().n;
 assert.throws(()=>migrateReference(db),/Unversioned/);assert.equal(db.prepare('SELECT total_changes() n').get().n,before);assert.equal(db.prepare('SELECT name FROM workspaces').get().name,'Synthetic old');assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='inventory_reference_migrations'").get().n,0);
 }finally{db.close();}
});
test('changed, missing and out-of-order migration histories fail closed',()=>temporary((directory,url)=>{
 const db=database();try{copyFileSync(new URL('../migrations/0001_stock.sql',import.meta.url),join(directory,'0001_stock.sql'));migrateReference(db,url);const before=db.prepare('SELECT * FROM inventory_reference_migrations').all();writeFileSync(join(directory,'0001_stock.sql'),readFileSync(join(directory,'0001_stock.sql'),'utf8')+'\n-- changed');assert.throws(()=>migrateReference(db,url),/differs/);assert.deepEqual(db.prepare('SELECT * FROM inventory_reference_migrations').all(),before);
 rmSync(join(directory,'0001_stock.sql'));writeFileSync(join(directory,'0002_future.sql'),'SELECT 1;');assert.throws(()=>migrateReference(db,url),/sequential/);
 }finally{db.close();}
}));
test('failed pending migration rolls back its DDL/data and retains original history',()=>temporary((directory,url)=>{
 const db=database();try{copyFileSync(new URL('../migrations/0001_stock.sql',import.meta.url),join(directory,'0001_stock.sql'));migrateReference(db,url);db.prepare('INSERT INTO workspaces VALUES(?,?)').run('a','Synthetic');writeFileSync(join(directory,'0002_failure.sql'),"CREATE TABLE should_rollback(id TEXT); INSERT INTO workspaces VALUES('b','Rollback'); SELECT * FROM missing_table;");assert.throws(()=>migrateReference(db,url),/missing_table/);assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='should_rollback'").get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM workspaces').get().n,1);assert.equal(db.prepare('SELECT count(*) n FROM inventory_reference_migrations').get().n,1);
 }finally{db.close();}
}));
test('migration schema and reference snapshot have equivalent stock constraints and triggers',()=>{
 const versioned=openStock(),reference=database();try{reference.exec(readFileSync(new URL('../lib/schema.sql',import.meta.url),'utf8'));const definition=db=>db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name<>'inventory_reference_migrations' ORDER BY type,name").all().map(r=>({...r,sql:r.sql?.replace(/ IF NOT EXISTS/g,'')}));assert.deepEqual(definition(versioned),definition(reference));}finally{versioned.close();reference.close();}
});

test('workspace creation migration upgrades version one without changing stock or memberships',()=>temporary((directory,url)=>{
 const db=database();try{copyFileSync(new URL('../migrations/0001_stock.sql',import.meta.url),join(directory,'0001_stock.sql'));migrateReference(db,url);provision(db,{orgId:'old-synthetic',userId:'old-owner',name:'Synthetic existing'});const stock=new Stock(db,{orgId:'old-synthetic',userId:'old-owner'}),item=stock.item({sku:'OLD',name:'Existing synthetic goods',unit:'each'}),warehouse=stock.warehouse({code:'OLD',name:'Existing synthetic warehouse'});stock.post({kind:'receive',itemId:item.id,warehouseId:warehouse.id,quantity:'2',reason:'Synthetic pre-upgrade stock',requestId:'pre-upgrade-stock'});const tables=['workspaces','members','items','warehouses','balances','movements'],before=tables.map(t=>db.prepare('SELECT * FROM '+t).all());assert.deepEqual(migrateReference(db),['0002_workspace_starts.sql']);assert.deepEqual(tables.map(t=>db.prepare('SELECT * FROM '+t).all()),before);assert.equal(db.prepare('SELECT count(*) n FROM workspace_starts').get().n,0);
 }finally{db.close();}
}));
