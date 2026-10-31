// Local QA coordination only. No code/password/token is printed or persisted.
// The actual hosted browser/server still verifies the one-use mailbox code.
import net from 'node:net';
const server=net.createServer(socket=>{let value='';socket.setTimeout(5000,()=>socket.destroy());socket.on('data',chunk=>{value+=chunk.toString('utf8');if(value.length>128){socket.destroy();return;}if(!value.includes('\n'))return;try{const cmd=JSON.parse(value);if(Object.keys(cmd).length!==1||typeof cmd.code!=='string'||!/^\d{6}$/.test(cmd.code))throw Error();process.stdin.emit('data',Buffer.from(JSON.stringify(cmd)+'\n'));socket.end('accepted\n');}catch{socket.end('rejected\n');}});});
server.listen(0,'127.0.0.1',()=>{console.log(JSON.stringify({qaLocalMailPort:server.address().port,loopbackOnly:true,noSecretLogging:true}));server.unref();});
