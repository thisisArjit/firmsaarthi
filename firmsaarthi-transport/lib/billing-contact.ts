export const DEFAULT_BILLING_CONTACT='firmsaarthi@gmail.com';
export function billingContact(value:unknown){const text=String(value||'').trim();return !text||text.toLowerCase()==='logistrace@gmail.com'?DEFAULT_BILLING_CONTACT:text;}
export function billingContactHref(value:string){return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value)?'mailto:'+encodeURIComponent(value).replace('%40','@'):null;}
