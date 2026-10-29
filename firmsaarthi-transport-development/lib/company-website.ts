export type CompanyWebsite={name:string;headline:string;about:string;city:string;address:string;phone:string;email:string;whatsapp:string;services:string[];routes:string[]};
const reserved=new Set(['api','account','subscription','support','login','logout','signup','settings','admin','profile','website','preview','transport','favicon','robots','sitemap','www','_next','assets','billing','consignments','companies','suppliers','trucks','staff','tracking','invoice','invoices','help','terms','privacy','firmSaarthi'.toLowerCase()]);
reserved.add('manage-plan');
export function websiteSlug(value:unknown){const s=String(value||'').trim().toLowerCase();if(!/^[a-z][a-z0-9-]{2,39}$/.test(s)||s.endsWith('-')||s.includes('--')||reserved.has(s))throw new Error('Choose 3–40 letters, numbers or single hyphens, starting with a letter. This address may be reserved.');return s;}
export function validateWebsite(value:unknown):CompanyWebsite{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Enter your website details.');const v=value as Record<string,unknown>;
  const text=(key:string,max:number,required=false)=>{if(typeof v[key]!=='string')throw new Error('Enter valid '+key+'.');const s=(v[key] as string).trim();if((required&&!s)||s.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s))throw new Error('Check '+key+' (maximum '+max+' characters).');return s;};
  const list=(key:string,max:number)=>{if(!Array.isArray(v[key])||(v[key] as unknown[]).length>max)throw new Error('Choose up to '+max+' '+key+'.');return [...new Set((v[key] as unknown[]).map(x=>{if(typeof x!=='string'||x.trim().length>100||/[\x00-\x1f\x7f]/.test(x))throw new Error('Check your '+key+'.');return x.trim();}).filter(Boolean))];};
  const phone=text('phone',25),email=text('email',200),whatsapp=text('whatsapp',16);
  if(phone&&!/^\+?[0-9 ()-]{6,25}$/.test(phone))throw new Error('Enter a valid public phone number.');
  if(email&&!/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email))throw new Error('Enter a valid public email address.');
  if(whatsapp&&!/^[1-9][0-9]{7,14}$/.test(whatsapp))throw new Error('WhatsApp must include the country code, digits only (for example 919876543210).');
  return {name:text('name',120,true),headline:text('headline',160,true),about:text('about',1800),city:text('city',100),address:text('address',400),phone,email,whatsapp,services:list('services',6),routes:list('routes',12)};
}
export function websiteBasics(name:string,profile:Record<string,unknown>):CompanyWebsite{return {name:String(profile.transportName||name).slice(0,120),headline:'Transport enquiries, made simple.',about:'',city:'',address:String(profile.address||'').slice(0,400),phone:String(profile.contactNumber||'').slice(0,25),email:'',whatsapp:'',services:[],routes:[]};}
