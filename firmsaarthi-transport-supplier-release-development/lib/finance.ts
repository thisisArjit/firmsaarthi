import type { Row } from './domain';

export const financeCategories = [
  {id:'fuel',label:'Fuel (additional company cost)',group:'direct'},
  {id:'tolls',label:'Tolls (additional company cost)',group:'direct'},
  {id:'loading',label:'Loading / unloading',group:'direct'},
  {id:'driver_allowance',label:'Driver allowance',group:'direct'},
  {id:'direct_other',label:'Other additional transport cost',group:'direct'},
  {id:'rent',label:'Office / yard rent',group:'overheads'},
  {id:'staff',label:'Staff salaries and benefits',group:'overheads'},
  {id:'utilities',label:'Electricity, phone and internet',group:'overheads'},
  {id:'maintenance',label:'Repairs and maintenance',group:'overheads'},
  {id:'insurance',label:'Insurance',group:'overheads'},
  {id:'software',label:'Software subscriptions',group:'overheads'},
  {id:'professional',label:'Professional and accounting fees',group:'overheads'},
  {id:'office_other',label:'Other operating expenses',group:'overheads'},
  {id:'other_income',label:'Other operating income',group:'income'},
  {id:'depreciation',label:'Depreciation expense',group:'depreciation'},
  {id:'interest',label:'Interest and finance costs',group:'finance'},
  {id:'income_tax',label:'Company income-tax expense',group:'tax'},
  {id:'asset_purchase',label:'Asset purchase (outside P&L)',group:'excluded'},
  {id:'loan_principal',label:'Loan principal (outside P&L)',group:'excluded'},
  {id:'owner_drawings',label:'Owner drawings (outside P&L)',group:'excluded'},
  {id:'deposit',label:'Refundable deposit (outside P&L)',group:'excluded'},
] as const;
export const categoryFor = (id:string) => financeCategories.find(c=>c.id===id);

export function companyPnl(consignments:Row[], invoices:Row[], entries:Row[], from:string, to:string) {
  const within=(date:string)=>date>=from&&date<=to;
  const trips=consignments.filter(r=>within(r.date));
  const posted=entries.filter(r=>r.status==='posted'&&within(r.date));
  const lines:Row[]=[];
  for(const r of trips){
    lines.push({id:r.id,source:'Consignment',reference:r.cn,date:r.date,category:'Freight revenue',group:'revenue',amount:r.freight});
    if(r.truck_freight)lines.push({id:r.id,source:'Provider ledger',reference:r.cn,date:r.date,category:'Hired truck freight',group:'direct',amount:r.truck_freight});
    if(r.other_charges)lines.push({id:r.id,source:'Provider ledger',reference:r.cn,date:r.date,category:'Provider other charges',group:'direct',amount:r.other_charges});
  }
  for(const invoice of invoices.filter(r=>within(r.date))){
    const snapshot=typeof invoice.snapshot==='string'?JSON.parse(invoice.snapshot):invoice.snapshot;
    const extras=(snapshot?.charges||[]).reduce((n:number,c:Row)=>n+Number(c.amount||0),0);
    if(extras)lines.push({id:invoice.id,source:'Invoice extras',reference:String(invoice.number),date:invoice.date,category:'Invoiced additional revenue',group:'revenue',amount:extras});
  }
  for(const entry of posted){const category=categoryFor(entry.category);if(category)lines.push({id:entry.id,source:'Finance voucher',reference:entry.reference||entry.description,date:entry.date,category:category.label,group:category.group,amount:entry.amount});}
  const total=(group:string)=>lines.filter(r=>r.group===group).reduce((n,r)=>n+Number(r.amount),0);
  const revenue=total('revenue'),directCosts=total('direct'),otherIncome=total('income'),overheads=total('overheads'),depreciation=total('depreciation'),financeCosts=total('finance'),incomeTax=total('tax');
  const contribution=revenue-directCosts,operatingProfit=contribution+otherIncome-overheads,profitBeforeTax=operatingProfit-depreciation-financeCosts,netProfit=profitBeforeTax-incomeTax;
  const categories=Array.from(new Set(lines.map(r=>r.category))).map(category=>({category,group:lines.find(r=>r.category===category)!.group,amount:lines.filter(r=>r.category===category).reduce((n,r)=>n+r.amount,0)}));
  const months=Array.from(new Set(lines.filter(r=>r.group!=='excluded').map(r=>r.date.slice(0,7)))).sort().map(month=>{
    const sum=(groups:string[])=>lines.filter(r=>r.date.startsWith(month)&&groups.includes(r.group)).reduce((n,r)=>n+r.amount,0);
    const income=sum(['revenue','income']),costs=sum(['direct','overheads','depreciation','finance','tax']);return {month,income,costs,netProfit:income-costs};
  });
  return {from,to,basis:'Accrual management report; freight and provider costs use consignment date, invoice extras use invoice date, vouchers use recognition date.',revenue,directCosts,contribution,otherIncome,overheads,operatingProfit,depreciation,financeCosts,profitBeforeTax,incomeTax,netProfit,excludedMovements:total('excluded'),recoverableTax:posted.reduce((n,r)=>n+r.recoverable_tax,0),tripCount:trips.length,uncostedTrips:trips.filter(r=>!r.truck_freight).length,draftCount:entries.filter(r=>r.status==='draft'&&within(r.date)).length,categories,months,lines:lines.sort((a,b)=>a.date.localeCompare(b.date))};
}
