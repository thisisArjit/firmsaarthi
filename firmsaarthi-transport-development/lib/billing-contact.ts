export const DEFAULT_BILLING_CONTACT='firmsaarthi@gmail.com';
export function billingContact(value:unknown){return String(value||'').trim()||DEFAULT_BILLING_CONTACT;}
export function billingContactHref(value:string){return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value)?'mailto:'+encodeURIComponent(value).replace('%40','@'):null;}
