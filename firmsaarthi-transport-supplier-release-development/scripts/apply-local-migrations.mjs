import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
const args=process.argv.slice(2);if(args.length&&!(args.length===2&&args[0]==='--from'&&/^\d{4}$/.test(args[1])))throw Error('Use --from NNNN only for a verified existing local schema.');
const start=args[1]||'',base=['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--json'];
function execute(rest){const result=spawnSync(process.execPath,[...base,...rest],{encoding:'utf8'});if(result.status!==0)throw Error(result.stderr||result.stdout);return JSON.parse(result.stdout).flatMap(r=>r.results||[]);}
execute(['--command','CREATE TABLE IF NOT EXISTS __logistrace_local_migrations(name TEXT PRIMARY KEY NOT NULL);']);const applied=new Set(execute(['--command','SELECT name FROM __logistrace_local_migrations']).map(r=>r.name));
if(!applied.size&&!start&&execute(['--command',"SELECT name FROM sqlite_master WHERE type='table' AND name='organizations'"]).length)throw Error('Existing local schema has no helper ledger. Verify its last applied version and use --from.');
for(const file of readdirSync('drizzle').filter(f=>/^\d{4}_[\w-]+\.sql$/.test(f)).sort()){if(applied.has(file)||(start&&file.slice(0,4)<start))continue;execute(['--file','drizzle/'+file]);execute(['--command',`INSERT INTO __logistrace_local_migrations(name) VALUES('${file}');`]);console.log('Applied local schema migration '+file);}
