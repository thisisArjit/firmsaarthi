// Runtime-neutral: quantities are exact integer millionths, never money.
export const units=Object.freeze({each:0,box:0,kg:3,litre:3,metre:3});
export const text=(value,label,max=200)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw Error(`Invalid ${label}.`);return value.trim();};
export function quantity(value,unit){if(!Object.hasOwn(units,unit)||typeof value!=='string'||!/^\d{1,7}(?:\.\d{1,3})?$/.test(value))throw Error('Enter a decimal quantity without commas or exponents.');const [a,b='']=value.split('.');if(b.length>units[unit])throw Error('Quantity exceeds base-unit precision.');const n=BigInt(a)*1000000n+BigInt(b.padEnd(6,'0'));if(n<=0n||n>9000000000000n)throw Error('Quantity is outside the allowed range.');return Number(n);}
export function displayQuantity(n){const v=BigInt(n),sign=v<0n?'-':'',a=v<0n?-v:v;return sign+(a/1000000n).toString()+(a%1000000n?'.'+(a%1000000n).toString().padStart(6,'0').replace(/0+$/,''):'');}
export function movementInput(input,role){
 const kind=text(input.kind,'movement kind'),requestId=text(input.requestId,'request ID',100),reason=text(input.reason,'reason',500);
 if(!/^[A-Za-z0-9_-]{8,100}$/.test(requestId))throw Error('Invalid request ID.');
 if(!['receive','issue','adjust_in','adjust_out','reverse'].includes(kind)||role==='viewer'||role==='operator'&&!['receive','issue'].includes(kind))throw Error('Stock permission required.');
 const payload=JSON.stringify({kind,itemId:input.itemId??null,warehouseId:input.warehouseId??null,quantity:input.quantity??null,reverses:input.reverses??null,expectedVersion:input.expectedVersion??null,reason});
 return {kind,requestId,reason,payload};
}
