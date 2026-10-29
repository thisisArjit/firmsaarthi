import {AppError,type Identity} from './service';
import {requireTransporter,businessMode} from './business-mode';
import type {Row} from './domain';

import {truckTypes,type SupplierProfile,type SupplierTruck,type SupplierLane,type SupplierDraft} from './supplier-types';
const empty=():SupplierDraft=>({profile:{name:'',kind:'Fleet owner',city:'',contact:'',phone:'',email:'',about:''},trucks:[],routes:[]});
function text(v:unknown,label:string,max=100,optional=false){if(typeof v!=='string'||v.trim().length>max||(!optional&&!v.trim())||/[\u0000-\u001f]/.test(v))throw new AppError(`Enter ${label}${optional?'': ' (required)'} of up to ${max} characters.`);return v.trim().replace(/\s+/g,' ');}
function one(v:unknown,values:readonly string[],label:string){if(typeof v!=='string'||!values.includes(v))throw new AppError(`Choose a valid ${label}.`);return v;}
function uuid(v:unknown){if(typeof v!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v))throw new AppError('Invalid record or request ID.');return v;}
function bool(v:unknown){if(typeof v!=='boolean')throw new AppError('Choose a valid route direction.');return v;}
function profile(v:Row):SupplierProfile{
  const phone=text(v.phone,'business phone',20),email=text(v.email,'contact email',254);
  if(!/^\+?[0-9][0-9 ()-]{6,18}[0-9]$/.test(phone)||phone.replace(/\D/g,'').length<8||phone.replace(/\D/g,'').length>15)throw new AppError('Enter a valid business phone number.');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new AppError('Enter a valid contact email.');
  return {name:text(v.name,'business name',150),kind:one(v.kind,['Fleet owner','Attached fleet','Broker / aggregator'],'supplier type'),city:text(v.city,'base city',80),contact:text(v.contact,'business contact name',100),phone,email:email.toLowerCase(),about:text(v.about??'','business description',500,true)};
}
function truck(v:Row,clock:Date):SupplierTruck{
  const registration=text(v.registration,'registration',20).replace(/[ -]/g,'').toUpperCase();
  if(!/^[A-Z0-9]{6,20}$/.test(registration))throw new AppError('Enter a registration of 6–20 letters and numbers.');
  const capacity=Number(v.capacity);if(!Number.isFinite(capacity)||capacity<=0||capacity>200||Math.round(capacity*1000)!==capacity*1000)throw new AppError('Payload must be greater than 0 and up to 200 tonnes, with up to 3 decimal places.');
  const status=one(v.status,['available','busy','inactive'],'availability'),city=text(v.city??'','current city',80,status!=='available');
  let availableUntil='';if(status==='available'){
    if(typeof v.availableUntil!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v.availableUntil))throw new AppError('Choose when availability expires.');
    availableUntil=v.availableUntil;const end=Date.parse(availableUntil+'T18:29:59.999Z');
    if(!Number.isFinite(end)||new Date(end).toISOString().slice(0,10)!==availableUntil||end<clock.getTime()||end>clock.getTime()+31*86400000)throw new AppError('Availability must expire within the next 30 days.');
  }
  return {id:uuid(v.id),registration,type:one(v.type,truckTypes,'truck type'),capacity,relationship:one(v.relationship,['Owned','Attached'],'truck relationship'),status,city,availableUntil};
}
function lane(v:Row):SupplierLane{
  const origin=text(v.origin,'pickup city',80),destination=text(v.destination,'destination city',80);
  if(origin.toLowerCase()===destination.toLowerCase())throw new AppError('Choose different origin and destination cities.');
  return {id:uuid(v.id),origin,destination,type:one(v.type,['Any',...truckTypes],'truck type'),returnRoute:bool(v.returnRoute)};
}
const active=(t:SupplierTruck,clock:Date)=>t.status==='available'&&Date.parse(t.availableUntil+'T18:29:59.999Z')>=clock.getTime();
// This is an explicit allowlist. Registration numbers, account email/IDs,
// private transporter records, documents and driver details never enter it.
function projection(draft:SupplierDraft,at:string){
  return {profile:{...profile(draft.profile)},trucks:draft.trucks.filter(t=>t.status!=='inactive').map(t=>({type:t.type,capacity:t.capacity,relationship:t.relationship,status:t.status,city:t.city,availableUntil:t.availableUntil})),routes:draft.routes.map(r=>({origin:r.origin,destination:r.destination,type:r.type,returnRoute:r.returnRoute})),confirmedAt:at};
}
export class SupplierMarketplace {
  constructor(public db:D1Database,public user:Identity,private clock=()=>new Date()){}
  q(sql:string,...args:any[]){return this.db.prepare(sql).bind(...args);}
  async member(owner=false){
    const m=await this.q('SELECT m.*,o.owner_id FROM memberships m JOIN organizations o ON o.id=m.org_id JOIN password_accounts a ON a.user_id=m.user_id WHERE m.user_id=? AND a.disabled=0',this.user.userId).first<Row>();
    if(!m||!['OWNER','MEMBER'].includes(m.role))throw new AppError('Supplier workspace access is unavailable.',403);
    if(owner&&(m.role!=='OWNER'||m.owner_id!==this.user.userId))throw new AppError('Only the workspace owner can change this listing.',403);return m;
  }
  async state(){const m=await this.member(),row=await this.q('SELECT * FROM supplier_listings WHERE org_id=?',m.org_id).first<Row>();
    return {mode:await businessMode(this.db,this.user.userId),owner:m.role==='OWNER',version:row?.version??0,draft:row?JSON.parse(row.draft) as SupplierDraft:empty(),published:row?.published?JSON.parse(row.published):null,publishedAt:row?.published_at??null,updatedAt:row?.updated_at??null};
  }
  async command(input:Row){
    const m=await this.member(true),action=one(input.action,['profile.save','truck.save','truck.remove','route.save','route.remove','publish','unpublish'],'supplier action'),requestId=uuid(input.requestId),version=input.version;
    if(!Number.isSafeInteger(version)||version<0)throw new AppError('Reload the supplier workspace before saving.');
    const at=this.clock().toISOString(),data=input.data??{};if(!data||typeof data!=='object'||Array.isArray(data))throw new AppError('Invalid supplier details.');
    const payload=JSON.stringify({action,version,data});
    const replay=async()=>{const saved=await this.q('SELECT * FROM supplier_listing_requests WHERE org_id=? AND request_id=?',m.org_id,requestId).first<Row>();if(!saved)return null;if(saved.payload!==payload)throw new AppError('This request was used with different details. Review before retrying.',409);return {success:true,version:saved.result_version,alreadyRecorded:true};};
    const prior=await replay();if(prior)return prior;
    let validated:Row={};if(action==='profile.save')validated=profile(data);if(action==='truck.save')validated=truck(data,this.clock());if(action==='route.save')validated=lane(data);if(action.endsWith('.remove'))validated={id:uuid(data.id)};if(action==='publish'){if(data.confirm!==true)throw new AppError('Confirm that you may share these business details with registered transporters.');validated={confirm:true};}
    const row=await this.q('SELECT * FROM supplier_listings WHERE org_id=?',m.org_id).first<Row>();
    if((row?.version??0)!==version){
      // The first receipt read can precede another request's commit while the
      // version read follows it. Recheck the atomic receipt before declaring a
      // conflict; a stale different request must still never overwrite a draft.
      const committed=await replay();if(committed)return committed;
      throw new AppError('This listing changed in another tab. Reload to review it; your unsaved form is still here.',409);
    }
    const draft:SupplierDraft=row?JSON.parse(row.draft):empty();let published=row?.published??null,publishedAt=row?.published_at??null;
    if(action==='profile.save')draft.profile=validated as SupplierProfile;
    if(action==='truck.save'){
      const t=validated as SupplierTruck;if(draft.trucks.some(x=>x.registration===t.registration&&x.id!==t.id))throw new AppError('This registration is already in your fleet.',409);
      if(!draft.trucks.some(x=>x.id===t.id)&&draft.trucks.length>=100)throw new AppError('This preview supports up to 100 trucks per supplier.');
      draft.trucks=[...draft.trucks.filter(x=>x.id!==t.id),t];
    }
    if(action==='route.save'){
      const r=validated as SupplierLane;if(draft.routes.some(x=>x.id!==r.id&&x.origin.toLowerCase()===r.origin.toLowerCase()&&x.destination.toLowerCase()===r.destination.toLowerCase()&&x.type===r.type))throw new AppError('This route is already saved.',409);
      if(!draft.routes.some(x=>x.id===r.id)&&draft.routes.length>=100)throw new AppError('This preview supports up to 100 routes per supplier.');draft.routes=[...draft.routes.filter(x=>x.id!==r.id),r];
    }
    if(action==='truck.remove'||action==='route.remove'){const key=action==='truck.remove'?'trucks':'routes';if(!draft[key].some(x=>x.id===validated.id))throw new AppError('Record not found in your workspace.',404);draft[key]=draft[key].filter(x=>x.id!==validated.id) as SupplierTruck[]&SupplierLane[];}
    // An edit cannot leave withdrawn contact/fleet information advertised.
    if(action!=='publish'){published=null;publishedAt=null;}
    if(action==='publish'){
      if(!draft.trucks.some(t=>t.status!=='inactive')||!draft.routes.length)throw new AppError('Add at least one active truck and one preferred route before publishing.');
      published=JSON.stringify(projection(draft,at));publishedAt=at;
    }
    const write=row?this.q('UPDATE supplier_listings SET draft=?,published=?,published_at=?,version=version+1,updated_at=? WHERE org_id=? AND version=? AND EXISTS(SELECT 1 FROM memberships m JOIN password_accounts a ON a.user_id=m.user_id JOIN organizations o ON o.id=m.org_id WHERE m.user_id=? AND m.org_id=? AND m.role=\'OWNER\' AND o.owner_id=m.user_id AND a.disabled=0) RETURNING version',JSON.stringify(draft),published,publishedAt,at,m.org_id,version,this.user.userId,m.org_id):this.q('INSERT INTO supplier_listings(org_id,draft,published,version,updated_at,published_at) SELECT ?,?,?,1,?,? WHERE EXISTS(SELECT 1 FROM memberships m JOIN password_accounts a ON a.user_id=m.user_id JOIN organizations o ON o.id=m.org_id WHERE m.user_id=? AND m.org_id=? AND m.role=\'OWNER\' AND o.owner_id=m.user_id AND a.disabled=0) ON CONFLICT(org_id) DO NOTHING RETURNING version',m.org_id,JSON.stringify(draft),published,at,publishedAt,this.user.userId,m.org_id);
    const result=await this.db.batch([write,this.q('INSERT INTO supplier_listing_requests SELECT ?,?,?,?,? WHERE changes()>0',m.org_id,requestId,payload,version+1,at),this.q('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',crypto.randomUUID(),m.org_id,this.user.userId,`supplier-listing.${action}`,m.org_id,at)]);
    if(!result[0].results?.length){const won=await replay();if(won)return won;throw new AppError('This listing changed or your access ended. Reload before saving.',409);}return {success:true,version:version+1};
  }
  async discover(filters:Record<string,string>){
    await this.member();await requireTransporter(this.db,this.user.userId);
    const origin=text(filters.origin??'','pickup filter',80,true).toLowerCase(),destination=text(filters.destination??'','destination filter',80,true).toLowerCase(),type=one(filters.type||'Any',['Any',...truckTypes],'truck type'),capacity=Number(filters.capacity||0),offset=Number(filters.offset||0);
    if(!Number.isFinite(capacity)||capacity<0||capacity>200||!Number.isSafeInteger(offset)||offset<0||offset>10000)throw new AppError('Choose valid capacity and page filters.');
    const available=filters.available==='true';if(filters.available&&!['true','false'].includes(filters.available))throw new AppError('Invalid availability filter.');
    // Route AND equipment criteria are evaluated together on the allowed public
    // snapshot in SQL; never fetch private drafts to construct a directory.
    const rows=await this.q(`SELECT l.org_id,l.published,l.published_at FROM supplier_listings l JOIN organizations o ON o.id=l.org_id JOIN memberships m ON m.user_id=o.owner_id AND m.org_id=o.id AND m.role='OWNER' JOIN password_accounts a ON a.user_id=m.user_id AND a.disabled=0
      WHERE l.published IS NOT NULL AND EXISTS(SELECT 1 FROM json_each(l.published,'$.routes') r WHERE (((?='' OR lower(json_extract(r.value,'$.origin'))=?) AND (?='' OR lower(json_extract(r.value,'$.destination'))=?)) OR (json_extract(r.value,'$.returnRoute')=1 AND (?='' OR lower(json_extract(r.value,'$.destination'))=?) AND (?='' OR lower(json_extract(r.value,'$.origin'))=?))) AND (?='Any' OR json_extract(r.value,'$.type') IN ('Any',?)))
      AND EXISTS(SELECT 1 FROM json_each(l.published,'$.trucks') t WHERE (?='Any' OR json_extract(t.value,'$.type')=?) AND json_extract(t.value,'$.capacity')>=? AND (?=0 OR (json_extract(t.value,'$.status')='available' AND json_extract(t.value,'$.availableUntil')>=?)))
      ORDER BY l.published_at DESC,l.org_id LIMIT 21 OFFSET ?`,origin,origin,destination,destination,origin,origin,destination,destination,type,type,type,type,capacity,available?1:0,new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(this.clock()),offset).all<Row>();
    return {items:rows.results.slice(0,20).map(r=>{const p=JSON.parse(r.published);return {id:r.org_id,...p,trucks:p.trucks.map((t:SupplierTruck)=>({...t,status:active(t,this.clock())?'available':t.status==='available'?'availability expired':t.status}))};}),hasMore:rows.results.length>20,offset,asOf:this.clock().toISOString()};
  }
}
