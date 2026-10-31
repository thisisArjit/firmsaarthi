// One-use laptop-only delivery of an existing disposable synthetic login to
// the CUA runtime. No browser cookie or user-selected password is transferred.
import net from 'node:net';
import {createInterface} from 'node:readline';
if(process.stdin.isTTY)process.stdin.setRawMode(true);
console.log('Ready for hidden synthetic-login configuration.');
const lines=createInterface({input:process.stdin,terminal:false});
const cfg=await new Promise(resolve=>lines.once('line',s=>resolve(JSON.parse(s))));
if(!/^firmsaarthi\+qa-(supplier|transporter)-desktop-[a-z0-9]+@gmail\.com$/.test(cfg.email)||typeof cfg.password!=='string'||cfg.password.length<8)throw Error('Disposable synthetic identity required');
let served=false;
const server=net.createServer(socket=>{let value='';socket.setTimeout(5000,()=>socket.destroy());socket.on('data',chunk=>{value+=chunk.toString('utf8');if(value.length>100){socket.destroy();return;}if(!value.includes('\n'))return;try{const request=JSON.parse(value);if(served||request.action!=='existing-synthetic-login')throw Error();served=true;socket.end(JSON.stringify({email:cfg.email,password:cfg.password})+'\n');server.close(()=>{clearTimeout(timer);lines.close();});}catch{socket.end('rejected\n');}});});
const timer=setTimeout(()=>{server.close();lines.close();},600000);
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({syntheticLoginPort:server.address().port,oneUse:true,noSecretLogging:true})));
