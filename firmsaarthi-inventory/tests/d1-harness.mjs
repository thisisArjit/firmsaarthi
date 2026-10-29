// Local contract harness only; this is not Cloudflare D1 or hosted E2E evidence.
export function d1Harness(sqlite,{beforeBatch}={}){
 const db={
  prepare(sql){
   const make=args=>({sql,args,bind(...values){return make(values);},async first(){const row=sqlite.prepare(sql).get(...args);return row?{...row}:null;},async all(){return {success:true,results:sqlite.prepare(sql).all(...args).map(r=>({...r}))};}});
   return make([]);
  },
  async batch(statements){
   if(beforeBatch)await beforeBatch(statements);
   sqlite.exec('BEGIN IMMEDIATE');try{
    const result=statements.map(s=>({success:true,results:sqlite.prepare(s.sql).all(...s.args).map(r=>({...r}))}));
    sqlite.exec('COMMIT');return result;
   }catch(e){sqlite.exec('ROLLBACK');throw e;}
  },
  withSession(constraint){if(constraint!=='first-primary')throw Error('Expected primary-first session');return db;},
 };return db;
}
