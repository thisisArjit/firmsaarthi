import { required, money, dateValue, type Row } from './domain';

export const eventKinds=['gps_position','toll_transaction','eway_bill'] as const;
export type EventKind=typeof eventKinds[number];
export function observedTime(value:unknown,label='Observation time') {
  const raw=String(value||'');if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:\d{2})$/.test(raw))throw new Error(`${label} needs an ISO date/time with timezone, such as 2026-10-25T10:30:00+05:30.`);
  dateValue(raw.slice(0,10));
  const time=new Date(raw);if(!Number.isFinite(time.getTime()))throw new Error(`Invalid ${label.toLowerCase()}.`);return time.toISOString();
}
export function normalizeEvent(kind:string,data:Row):Row {
  if(!eventKinds.includes(kind as EventKind))throw new Error('Choose a valid transport record type.');
  const vehicle=required(data.vehicle,'Vehicle',30).toUpperCase().replace(/\s+/g,'');
  if(!/^[A-Z0-9-]{4,30}$/.test(vehicle))throw new Error('Enter a valid vehicle registration.');
  const provider=required(data.provider,'Statement / data provider',100).toLowerCase();
  const externalId=required(data.externalId,'Source record ID',120);
  const observedAt=observedTime(data.observedAt);
  if(Date.parse(observedAt)>Date.now()+5*60000)throw new Error('Observation time cannot be in the future.');
  let payload:Row;
  if(kind==='gps_position'){
    if(data.latitude==null||String(data.latitude).trim()===''||data.longitude==null||String(data.longitude).trim()==='')throw new Error('Latitude and longitude are required.');
    const latitude=Number(data.latitude),longitude=Number(data.longitude),speed=Number(data.speed||0);
    if(!Number.isFinite(latitude)||latitude< -90||latitude>90||!Number.isFinite(longitude)||longitude< -180||longitude>180)throw new Error('Coordinates are outside the valid range.');
    if(!Number.isFinite(speed)||speed<0||speed>300)throw new Error('Speed must be between 0 and 300 km/h.');
    payload={latitude,longitude,speed};
  }else if(kind==='toll_transaction'){
    if(!['debit','refund','topup'].includes(data.direction))throw new Error('Toll direction must be debit, refund or topup.');
    const amount=money(data.amount);if(amount<=0)throw new Error('Transaction amount must be greater than zero.');
    payload={amount,direction:data.direction,plaza:String(data.plaza||'').trim().slice(0,200)};
  }else{
    const number=required(data.number,'E-way bill number',12);if(!/^\d{12}$/.test(number))throw new Error('E-way bill number must contain 12 digits.');
    const validUntil=observedTime(data.validUntil,'Recorded valid-until time');if(validUntil<observedAt)throw new Error('Valid-until time cannot be before the recorded issue time.');
    payload={number,validUntil,documentNumber:required(data.documentNumber,'Goods document reference',100),verification:'unverified'};
  }
  return {kind,vehicle,provider,external_id:externalId,observed_at:observedAt,payload:JSON.stringify(payload)};
}

// RFC 4180-style parser for the documented import templates. Bounded by the caller.
export function parseTransportCsv(text:string):Row[]{
  if(text.length>1024*1024)throw new Error('CSV must be 1 MB or smaller.');
  const records:string[][]=[];let row:string[]=[],value='',quoted=false;
  const source=text.replace(/^\uFEFF/,'');
  for(let i=0;i<source.length;i++){
    const c=source[i];if(c==='"'){if(quoted&&source[i+1]==='"'){value+='"';i++;}else if(quoted||value==='')quoted=!quoted;else throw new Error('Malformed CSV quoting.');}
    else if(c===','&&!quoted){row.push(value);value='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&source[i+1]==='\n')i++;row.push(value);if(row.some(v=>v.trim()))records.push(row);row=[];value='';}
    else value+=c;
  }
  if(quoted)throw new Error('CSV has an unclosed quoted field.');row.push(value);if(row.some(v=>v.trim()))records.push(row);
  if(records.length<2||records.length>251)throw new Error('Import between 1 and 250 data rows.');
  const headers=records.shift()!.map(s=>s.trim());if(headers.some(h=>!h)||new Set(headers).size!==headers.length||headers.some(h=>['__proto__','constructor','prototype'].includes(h)))throw new Error('CSV needs unique, non-empty column names.');
  return records.map((values,i)=>{if(values.length!==headers.length)throw new Error(`CSV row ${i+2} has the wrong number of fields.`);return Object.fromEntries(headers.map((h,j)=>[h,values[j].trim()]));});
}
