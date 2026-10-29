export type Row = Record<string, any>;
export function rateParts(value:unknown):{rate:number;rate_label:string|null}{
  const text=String(value??'').trim();
  return text!==''&&!Number.isFinite(Number(text.replace(/[,₹\s]/g,'')))?{rate:0,rate_label:required(text,'Rate',80)}:{rate:money(value),rate_label:null};
}
export function weightValue(value:unknown):string {
  const text=String(value??'0').trim()||'0';if(text.length>80)throw new Error('Weight description is too long.');
  if(Number.isFinite(Number(text))&&Number(text)<0)throw new Error('Weight cannot be negative.');return text;
}
export function money(value: unknown): number {
  const n = Number(String(value ?? 0).replace(/[,₹\s]/g, ''));
  if (!Number.isFinite(n) || n < 0 || n > 1e10) throw new Error('Enter a valid non-negative amount.');
  return Math.round(n * 100);
}
export function financialYear(date = new Date()): string {
  const y = date.getMonth() < 3 ? date.getFullYear() - 1 : date.getFullYear();
  return `${y}-${y + 1}`;
}
export function checkYear(year: unknown): string {
  const s = String(year || ''); const m = /^(20\d{2})-(20\d{2})$/.exec(s);
  if (!m || Number(m[2]) !== Number(m[1]) + 1) throw new Error('Invalid financial year.');
  return s;
}
export function dateValue(value: unknown, year?: string): string {
  const s = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString().slice(0,10) !== s) throw new Error('Enter a valid date.');
  if (year && (s < `${year.slice(0,4)}-04-01` || s > `${year.slice(5)}-03-31`)) throw new Error('Date must fall within the selected financial year.');
  return s;
}
export function required(value: unknown, label: string, max = 200): string {
  const s = String(value ?? '').trim();
  if (!s || s.length > max) throw new Error(`${label} is required (maximum ${max} characters).`);
  return s;
}
export function invoiceTotals(items: Row[], charges: Row[], taxMode: string, paidBy: string) {
  if (!['none','igst','cgst-sgst'].includes(taxMode)) throw new Error('Invalid tax mode.');
  if (!['','consignor','consignee'].includes(paidBy)) throw new Error('Invalid payer.');
  const freight = items.reduce((sum, r) => sum + Number(r.freight), 0);
  const advance = items.reduce((sum, r) => sum + Number(r.advance), 0);
  const other = charges.reduce((sum, r) => sum + Number(r.amount), 0);
  const subtotal = freight + other;
  const taxable = paidBy ? 0 : Math.max(0, subtotal - advance);
  const igst = taxMode === 'igst' ? Math.round(taxable * .05) : 0;
  const cgst = taxMode === 'cgst-sgst' ? Math.round(taxable * .025) : 0;
  const sgst = cgst;
  return { freight, advance, other, subtotal, balance: Math.max(0, subtotal - advance), igst, cgst, sgst, total: Math.max(0, subtotal - advance) + igst + cgst + sgst };
}
