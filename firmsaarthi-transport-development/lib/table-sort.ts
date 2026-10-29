export type SortValue=string|number|boolean|null|undefined;
const collator=new Intl.Collator('en-IN',{numeric:true,sensitivity:'base'});
export function sortValue(value:SortValue):string|number|null{
  if(value==null||value==='')return null;
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  if(typeof value==='boolean')return Number(value);
  const text=value.trim();if(!text||/^(unknown|not recorded|not added|none yet|—|-)$/i.test(text))return null;
  if(/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(text)){const date=Date.parse(text);if(Number.isFinite(date))return date;}
  const indian=text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(indian)return Date.UTC(Number(indian[3]),Number(indian[2])-1,Number(indian[1]));
  if(/^\d{1,2}\s+[a-z]{3,9}\s+\d{4}/i.test(text)){const date=Date.parse(text.replace(/(\d)(am|pm)/i,'$1 $2'));if(Number.isFinite(date))return date;}
  const amount=text.replace(/₹|INR|,|\s|%/gi,'');if(/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(amount))return Number(amount);
  return text;
}
export function compareValues(a:SortValue,b:SortValue,direction:1|-1=1){const av=sortValue(a),bv=sortValue(b);if(av===null||bv===null)return av===bv?0:av===null?1:-1;return (typeof av==='number'&&typeof bv==='number'?av-bv:collator.compare(String(av),String(bv)))*direction;}
export function sortedRows<T>(rows:readonly T[],value:(row:T)=>SortValue,direction:1|-1){return rows.map((row,index)=>({row,index})).sort((a,b)=>compareValues(value(a.row),value(b.row),direction)||a.index-b.index).map(x=>x.row);}
