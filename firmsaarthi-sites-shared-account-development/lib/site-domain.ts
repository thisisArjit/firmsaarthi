import {resolveStyle} from './templates';
export const PRICE = 199900;
export const DAY = 86400000;
export const SUPPORT = 'firmsaarthi@gmail.com';
export const RESERVED = new Set(['www','sites','sitesaarthi','transport','inventory','admin','api','mail','email','support','assets','favicon','signin-with-chatgpt','signout-with-chatgpt','callback','track','w','create','terms','privacy']);
export type Section = { title: string; content: string };
export type Brief = {
  business: string; category: string; tagline: string; description: string; contactName: string;
  email: string; phone: string; whatsapp: string; address: string; city: string; state: string; postcode: string;
  hours: string; audience: string; goal: string; services: string; socials: string; color: string;
  style: string; slug: string; domainType: 'path'|'subdomain'|'custom'; customDomain: string;
  sections: Section[]; consent: boolean;
};
export class SiteError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function clean(value: unknown, max = 200) { return typeof value === 'string' ? value.trim().slice(0,max) : ''; }
export function validateBrief(value: unknown): Brief {
  if (!value || typeof value !== 'object') throw new SiteError('Please fill in your business details.');
  const v = value as Record<string, unknown>;
  const b: Record<string, any> = {};
  for (const k of ['business','category','tagline','contactName','email','phone','whatsapp','address','city','state','postcode','hours','audience','goal','services','socials','style','customDomain']) b[k] = clean(v[k], ['services','socials','address'].includes(k)?1500:200);
  b.description = clean(v.description, 5000); b.slug = clean(v.slug, 40).toLowerCase();
  b.style=b.style||'studio';if(!['studio','cafe','clinic','bold'].includes(b.style))throw new SiteError('Choose one of the website templates.');
  b.color = /^#[a-fA-F0-9]{6}$/.test(String(v.color)) ? v.color : '#2e7668';
  b.domainType = v.domainType; b.consent = v.consent === true;
  if (!b.business || !b.contactName || !b.category || !b.phone || !b.city) throw new SiteError('Add your business name, category, contact name, phone and city.');
  if(b.description.length<30)throw new SiteError('Write a business description of at least 30 characters.');
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(b.email) || /[\r\n]/.test(b.email)) throw new SiteError('Enter a valid email address for updates.');
  if (!/^[+\d\s()-]{8,20}$/.test(b.phone)) throw new SiteError('Enter a valid contact number.');
  if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/.test(b.slug) || RESERVED.has(b.slug)) throw new SiteError('Choose an available address using 1–40 lowercase letters, numbers or hyphens.');
  if (!['path','subdomain','custom'].includes(b.domainType)) throw new SiteError('Choose a website address option.');
  if (!b.consent) throw new SiteError('Please confirm you can share this business content.');
  if (!Array.isArray(v.sections) || v.sections.length < 1 || v.sections.length > 12) throw new SiteError('Add between 1 and 12 website sections.');
  b.sections = v.sections.map((s: any) => ({ title: clean(s?.title,50), content: clean(s?.content,5000) }));
  if (b.sections.some((s: Section) => !s.title || !s.content)) throw new SiteError('Give each section a tab name and content.');
  if (new Set(b.sections.map((s: Section) => s.title.toLowerCase())).size !== b.sections.length) throw new SiteError('Use a different name for each tab.');
  return b as Brief;
}
export function websiteAddress(b: Pick<Brief,'slug'|'domainType'>) { return b.domainType === 'subdomain' ? `https://${b.slug}.firmsaarthi.com` : `https://www.firmsaarthi.com/${b.slug}`; }
export function accessState(row: {status?: string; paid_until?: string|null; trial_ends_at?: string|null}, now = Date.now()) {
  if (row.status === 'suspended') return 'suspended';
  if (row.paid_until && Date.parse(row.paid_until) > now) return 'active';
  if (row.trial_ends_at && Date.parse(row.trial_ends_at) > now) return 'preview';
  return row.trial_ends_at ? 'expired' : row.status||'submitted';
}
export function oneYearFrom(value: string) {
  const d = new Date(value), month = d.getUTCMonth(); d.setUTCFullYear(d.getUTCFullYear()+1);
  if (d.getUTCMonth() !== month) d.setUTCDate(0);
  return d.toISOString();
}
export async function digest(value: string) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join(''); }
export async function hmac(secret: string, value: string) { const k = await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']); return [...new Uint8Array(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join(''); }
export async function verifySignature(secret: string, value: string, signature: unknown) {
  if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = await hmac(secret,value); let diff=0; for(let i=0;i<64;i++) diff|=expected.charCodeAt(i)^signature.charCodeAt(i); return diff===0;
}
export function publicBrief(brief: Brief) {
  const {business,tagline,description,phone,whatsapp,address,city,state,postcode,hours,services,socials,color,style,sections} = brief;
  return {business,tagline,description,phone,whatsapp,address,city,state,postcode,hours,services,socials,color,style:resolveStyle(style,brief.category),sections:sections.filter(section=>section.content.trim())};
}
