import {test} from 'vitest';
import assert from 'node:assert/strict';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {GoogleAuth} from '../lib/google-auth';
const config={clientId:'synthetic-runtime-client',clientSecret:'synthetic-secret',redirectUri:'https://transport.test/api/auth/google/callback'};
test('Google token exchange uses Worker-supported manual redirects and verifies the returned identity',async()=>{
 const pair=await generateKeyPair('RS256'),jwk=await exportJWK(pair.publicKey),now=Math.floor(Date.now()/1000),nonce='synthetic-runtime-nonce',key=createLocalJWKSet({keys:[{...jwk,kid:'synthetic-runtime-key',alg:'RS256'}]});
 const token=await new SignJWT({iss:'https://accounts.google.com',aud:config.clientId,sub:'synthetic-runtime-subject',email:'runtime@google.test',email_verified:true,nonce,iat:now,exp:now+300}).setProtectedHeader({alg:'RS256',kid:'synthetic-runtime-key'}).sign(pair.privateKey);
 const fetcher=(async(input:any,init?:RequestInit)=>{assert.equal(String(input),'https://oauth2.googleapis.com/token');assert.equal(init?.redirect,'manual','Worker fetch rejects redirect:error');const body=new URLSearchParams(String(init?.body));assert.equal(body.get('code_verifier'),'synthetic-verifier');assert.equal(body.get('redirect_uri'),config.redirectUri);return Response.json({id_token:token});}) as typeof fetch;
 const auth=new GoogleAuth({} as D1Database,config);assert.deepEqual(await auth.exchange('synthetic-code',{nonce,verifier:'synthetic-verifier'},fetcher,key),{subject:'synthetic-runtime-subject',email:'runtime@google.test'});
});
test('Google token redirects fail closed without forwarding credentials to another host',async()=>{
 let calls=0;const fetcher=(async(input:any,init?:RequestInit)=>{calls++;assert.equal(String(input),'https://oauth2.googleapis.com/token');assert.equal(init?.redirect,'manual');return new Response(null,{status:302,headers:{Location:'https://untrusted.invalid/token'}});}) as typeof fetch;
 const auth=new GoogleAuth({} as D1Database,config);await assert.rejects(()=>auth.exchange('synthetic-code',{nonce:'synthetic-nonce',verifier:'synthetic-verifier'},fetcher),/Google sign-in failed/);assert.equal(calls,1);
});
