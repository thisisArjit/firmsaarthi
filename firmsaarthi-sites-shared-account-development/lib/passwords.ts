import { scryptAsync } from '@noble/hashes/scrypt';

const encoder = new TextEncoder();
export const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2,'0')).join('');
export const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export async function digest(value: string) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))); }
function equal(a: string,b: string) { let mismatch=a.length^b.length; for(let i=0;i<Math.max(a.length,b.length);i++) mismatch|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0); return mismatch===0; }
function bytes(value: string) { return Uint8Array.from(value.match(/../g)!,v=>parseInt(v,16)); }
export function validatePassword(value: unknown): asserts value is string {
  if(typeof value!=='string'||value.length<8||value.length>128) throw new Error('Use a password of 8 to 128 characters.');
}
export async function hashPassword(password: string) {
  validatePassword(password); const salt=crypto.getRandomValues(new Uint8Array(16));
  const key=await scryptAsync(encoder.encode(password),salt,{N:16384,r:8,p:5,dkLen:32,maxmem:32*1024*1024});
  return `scrypt$${hex(salt)}$${hex(key)}`;
}
export async function verifyPassword(password: unknown,stored: string) {
  if(typeof password!=='string'||password.length<1||password.length>1024)return false;
  if(stored.startsWith('legacy-sha256$')) {
    const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(password)));
    return equal(btoa(String.fromCharCode(...hash)),stored.slice(14));
  }
  const match=/^scrypt\$([a-f0-9]{32})\$([a-f0-9]{64})$/.exec(stored);
  if(!match)return false;
  const key=await scryptAsync(encoder.encode(password),bytes(match[1]),{N:16384,r:8,p:5,dkLen:32,maxmem:32*1024*1024});
  return equal(hex(key),match[2]);
}
// Legacy passwords may be shorter than the policy for newly chosen passwords.
export async function upgradePassword(password: string) {
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const key=await scryptAsync(encoder.encode(password),salt,{N:16384,r:8,p:5,dkLen:32,maxmem:32*1024*1024});
  return `scrypt$${hex(salt)}$${hex(key)}`;
}
