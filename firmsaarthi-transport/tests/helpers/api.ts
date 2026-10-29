import {env} from '../mocks/cloudflare';
import {database} from './database';
import {AuthService,cookieName} from '../../lib/auth';
import {TransportService} from '../../lib/service';
import * as tms from '../../app/api/tms/route';
import * as billing from '../../app/api/billing/route';
import * as workspace from '../../app/api/workspace/route';
import * as platform from '../../app/api/platform/route';
import * as auth from '../../app/api/auth/route';
import * as googleStart from '../../app/api/auth/google/start/route';
import * as template from '../../app/api/invoice-template/route';
import * as website from '../../app/api/company-website/route';
import * as tripPolicy from '../../app/api/trip-policy/route';
import * as pod from '../../app/api/tms/trip-documents/route';
import * as platformRecovery from '../../app/api/auth/platform-recovery/route';
export const routeHandlers:Record<string,any>={'/api/auth/google/start':googleStart,'/api/trip-policy':tripPolicy,'/api/company-website':website,'/api/tms':tms,'/api/billing':billing,'/api/workspace':workspace,'/api/platform':platform,'/api/auth':auth,'/api/invoice-template':template,'/api/tms/trip-documents':pod,'/api/auth/platform-recovery':platformRecovery};
export async function apiFixture(){const {db,sqlite}=database();for(const k of Object.keys(env))delete env[k];env.DB=db;const objects=new Map<string,Uint8Array>();env.BUCKET={put:async(k:string,b:Uint8Array)=>objects.set(k,b),delete:async(k:string)=>objects.delete(k),get:async(k:string)=>objects.has(k)?{body:objects.get(k),arrayBuffer:async()=>objects.get(k)!.slice().buffer}:null};const owner=new TransportService(db,{userId:'api-owner',email:'owner@api.test'});await owner.command('workspace.create',{name:'Synthetic API business'});const at=new Date().toISOString();sqlite.prepare('INSERT INTO password_accounts VALUES(?,?,?,?,0,?)').run('api-owner','owner@api.test','google-only$synthetic','api-owner-version',at);env.BILLING_ADMIN_USER_ID='api-owner';const token=await new AuthService(db).issue('api-owner','api-owner-version');let cookie=`${cookieName()}=${token}`;
 async function request(path:string,body?:any,options:{cookie?:string;origin?:string;method?:string;headers?:Record<string,string>}={}){const url=new URL(path,'https://local.test'),method=options.method||(body!==undefined?'POST':'GET'),headers:Record<string,string>={Cookie:options.cookie??cookie,...(method!=='GET'?{Origin:options.origin??url.origin}:{}),...options.headers};if(body!==undefined&&!(body instanceof FormData))headers['Content-Type']='application/json';const req=new Request(url,{method,headers,body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});const handler=routeHandlers[url.pathname]?.[method];return handler?handler(req):new Response('Not found',{status:404});}
 async function seed(){for(const cn of ['API-1','API-2'])await owner.command('consignment.save',{year:'2026-2027',cn,date:'2026-10-26',company:'Synthetic customer',truck:'BR01AB1234',origin:'Patna',destination:'Delhi',freight:'1000',advance:'0'});}
 return {db,sqlite,env,owner,objects,request,seed,setCookie:(v:string)=>{cookie=v;},getCookie:()=>cookie};
}
