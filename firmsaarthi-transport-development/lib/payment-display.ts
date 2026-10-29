// Presentation only: preserve stored provenance, accounting and unknown dates.
export function paymentLabel(value:unknown){const text=String(value??'');return ['legacy','legacy_flag','legacy_totals','manual'].includes(text)?'Manually entered':text;}
export function paymentReference(value:unknown){const text=String(value??'');return text==='Imported paid flag; payment date not recorded'?'Payment date not recorded':text;}
