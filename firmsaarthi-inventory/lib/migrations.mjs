// Local reference harness only. Hosted D1 must use its native migration tooling.
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const defaultDirectory=new URL('../migrations/',import.meta.url);
export function migrationFiles(directory=defaultDirectory){
 const names=readdirSync(directory).filter(name=>name.endsWith('.sql')).sort();
 if(!names.length)throw Error('No Inventory migrations found.');
 return names.map((name,index)=>{
  if(!new RegExp(`^${String(index+1).padStart(4,'0')}_[a-z0-9_]+\\.sql$`).test(name))throw Error('Inventory migrations must be sequential numbered SQL files.');
  const sql=readFileSync(new URL(name,directory),'utf8').replace(/\r\n/g,'\n');
  return {name,sql,checksum:createHash('sha256').update(sql).digest('hex')};
 });
}
export function migrateReference(db,directory=defaultDirectory){
 const files=migrationFiles(directory);
 if(db.prepare('PRAGMA foreign_keys').get().foreign_keys!==1)throw Error('Inventory migrations require foreign keys.');
 db.exec('BEGIN IMMEDIATE');
 try{
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r=>r.name);
  if(!tables.includes('inventory_reference_migrations')&&tables.length)throw Error('Unversioned database: explicit Inventory migration review required.');
  db.exec('CREATE TABLE IF NOT EXISTS inventory_reference_migrations(name TEXT PRIMARY KEY,checksum TEXT NOT NULL,applied_at TEXT NOT NULL)');
  const applied=db.prepare('SELECT name,checksum FROM inventory_reference_migrations ORDER BY name').all();
  for(let i=0;i<applied.length;i++)if(files[i]?.name!==applied[i].name||files[i]?.checksum!==applied[i].checksum)throw Error('Inventory migration history differs from source.');
  for(const file of files.slice(applied.length)){
   db.exec(file.sql);
   db.prepare('INSERT INTO inventory_reference_migrations VALUES(?,?,?)').run(file.name,file.checksum,new Date().toISOString());
  }
  if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Inventory foreign-key validation failed.');
  db.exec('COMMIT');return files.slice(applied.length).map(f=>f.name);
 }catch(error){db.exec('ROLLBACK');throw error;}
}
