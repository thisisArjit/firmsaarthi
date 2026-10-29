import { vehicleRegistration } from './trip-domain';
import type { Row } from './domain';

export const gpsProviders=[{id:'loconav',name:'LocoNav',supported:true,docs:'https://developers.loconav.com/',requirement:'Requires a LocoNav API token and vehicle IDs. Select Sync GPS now to refresh positions; updates are manual.'},{id:'wheelseye',name:'WheelsEye',supported:false,docs:'https://wheelseye.com/help/',requirement:'WheelsEye tracking is not available. Contact WheelsEye enterprise support about API access for your fleet.'}] as const;
export type GpsFix={providerVehicleId:string;registration:string;observedAt:string;latitude:number;longitude:number;speed:number|null;speedObservedAt:string|null};
function epoch(value:unknown){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<946684800||value*1000>Date.now()+300000)throw new Error('GPS response contains an invalid observation timestamp.');return new Date(value*1000).toISOString();}
export function normalizeLocoNav(body:Row,mappings:Row[]):GpsFix[]{
  if(body?.success!==true||!body.data||!Array.isArray(body.data.values)||body.data.values.length>100)throw new Error('GPS response does not match the documented LocoNav schema.');
  const fixes:GpsFix[]=[],seen=new Set<string>();
  for(const row of body.data.values){const providerId=String(row?.vehicleId||'').toLowerCase(),mapping=mappings.find(m=>m.provider_vehicle_id===providerId);if(!mapping||seen.has(providerId))throw new Error('GPS response includes an unmapped or duplicate provider vehicle.');seen.add(providerId);
    const registration=vehicleRegistration(row.vehicleNumber);if(registration!==mapping.registration)throw new Error('Provider truck registration does not match its reviewed vehicle mapping.');
    const gps=row.gps,lat=gps?.currentLocationCoordinates?.lat,long=gps?.currentLocationCoordinates?.long;
    if(!lat||!long||typeof lat.value!=='number'||typeof long.value!=='number'||!Number.isFinite(lat.value)||!Number.isFinite(long.value)||Math.abs(lat.value)>90||Math.abs(long.value)>180||lat.timestamp!==long.timestamp)throw new Error('GPS response contains invalid or inconsistent coordinates.');
    const observedAt=epoch(lat.timestamp);let speed:number|null=null,speedObservedAt:string|null=null;
    if(gps.speed?.value!==undefined){if(typeof gps.speed.value!=='number'||!Number.isFinite(gps.speed.value)||gps.speed.value<0||gps.speed.value>300||gps.speed.unit!=='km/h')throw new Error('GPS response contains unsupported speed data.');speed=gps.speed.value;speedObservedAt=epoch(gps.speed.timestamp);}
    fixes.push({providerVehicleId:providerId,registration,observedAt,latitude:lat.value,longitude:long.value,speed,speedObservedAt});
  }
  return fixes;
}
async function boundedJson(response:Response){
  if(!response.ok)throw new Error(response.status===401||response.status===403?'GPS provider rejected the credential or vehicle access.':response.status===429?'GPS provider rate limit reached. Try again later.':'GPS provider request failed.');
  if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('GPS provider returned an unsupported response.');
  const reader=response.body?.getReader();if(!reader)throw new Error('GPS provider returned no response body.');const parts:Uint8Array[]=[];let size=0;
  try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>2*1024*1024)throw new Error('GPS response exceeded the supported size.');parts.push(r.value);}}finally{await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}try{return JSON.parse(new TextDecoder().decode(bytes)) as Row;}catch{throw new Error('GPS provider returned invalid JSON.');}
}
export async function pullLocoNav(token:string,mappings:Row[],fetcher:typeof fetch=fetch):Promise<GpsFix[]>{
  if(!mappings.length||mappings.length>100)throw new Error('Map 1–100 authorized vehicles before synchronization.');const fixes:GpsFix[]=[],seen=new Set<string>();
  for(let page=1;page<=4;page++){
    let response:Response;try{response=await fetcher(`https://api.a.loconav.com/integration/api/v1/vehicles/telematics/last_known?page=${page}&perPage=50`,{method:'POST',headers:{'Content-Type':'application/json','User-Authentication':token},body:JSON.stringify({vehicleIds:mappings.map(m=>m.provider_vehicle_id),sensors:['gps']}),redirect:'error',signal:AbortSignal.timeout(10000)});}catch{throw new Error('GPS provider could not be reached within the time limit.');}
    const body=await boundedJson(response),batch=normalizeLocoNav(body,mappings);for(const f of batch){if(seen.has(f.providerVehicleId))throw new Error('GPS provider repeated a vehicle across pages.');seen.add(f.providerVehicleId);fixes.push(f);}
    const pagination=body.data.pagination;if(!pagination||typeof pagination.more!=='boolean')throw new Error('GPS provider pagination is missing.');if(!pagination.more)return fixes;
  }
  throw new Error('GPS provider pagination exceeded the supported limit.');
}
export async function sealGpsToken(token:string,keyText:string,scope:string):Promise<string>{
  const keyBytes=Uint8Array.from(atob(keyText),c=>c.charCodeAt(0));if(keyBytes.length!==32)throw new Error('GPS credential storage is not configured correctly.');
  const key=await crypto.subtle.importKey('raw',keyBytes,'AES-GCM',false,['encrypt']),iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(scope)},key,new TextEncoder().encode(token));
  return 'v1:'+btoa(String.fromCharCode(...iv))+':'+btoa(String.fromCharCode(...new Uint8Array(cipher)));
}
export async function openGpsToken(sealed:string,keyText:string,scope:string):Promise<string>{
  try{const [version,ivText,cipherText]=sealed.split(':');if(version!=='v1')throw new Error();const bytes=Uint8Array.from(atob(keyText),c=>c.charCodeAt(0));if(bytes.length!==32)throw new Error();const key=await crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['decrypt']);const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:Uint8Array.from(atob(ivText),c=>c.charCodeAt(0)),additionalData:new TextEncoder().encode(scope)},key,Uint8Array.from(atob(cipherText),c=>c.charCodeAt(0)));return new TextDecoder().decode(plain);}catch{throw new Error('GPS credential could not be opened. Re-enter it through the secure connection form.');}
}
