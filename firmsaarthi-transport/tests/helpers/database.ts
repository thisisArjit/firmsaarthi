import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
export function database(before=''){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')&&(!before||f<before)).sort())sqlite.exec(readFileSync(`drizzle/${file}`,'utf8'));
  class Statement {
    args:any[]=[];constructor(public sql:string){}bind(...args:any[]){this.args=args;return this;}
    async first(){return sqlite.prepare(this.sql).get(...this.args)||null;}
    async all(){return {results:sqlite.prepare(this.sql).all(...this.args)};}
    async run(){if(/\bRETURNING\b/i.test(this.sql)){const results=sqlite.prepare(this.sql).all(...this.args);return {success:true,results,meta:{changes:results.length}};}const result=sqlite.prepare(this.sql).run(...this.args);return {success:true,results:[],meta:{changes:result.changes}};}
  }
  return {sqlite,db:{prepare:(sql:string)=>new Statement(sql),batch:async(statements:Statement[])=>{sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}} as unknown as D1Database};
}
