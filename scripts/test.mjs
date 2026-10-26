import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
await build({entryPoints:['tests/service.test.ts'],outfile:'outputs/service.test.mjs',bundle:true,platform:'node',format:'esm',packages:'external'});
const result=spawnSync(process.execPath,['--test','outputs/service.test.mjs','tests/product-copy.test.mjs'],{stdio:'inherit'});
process.exit(result.status??1);
