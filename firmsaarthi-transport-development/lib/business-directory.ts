import type {Row} from './domain';
const sail='https://www.sail.co.in/en/marketing-network',bhel='https://www.bhel.com/units-and-divisions',date='2026-10-26';
// Published branch contacts; these are enquiry offices, not confirmed pickup sites.
const branches=[
  ['Patna','06122321697','bmpat.cmo@sail.in'],['Kolkata','03322829310','bmkol.cmo@sail.in'],
  ['Durgapur','03432970011','bmdur.cmo@sail.in'],['Bokaro','06542221936','bmbok.cmo@sail.in'],
  ['Guwahati','03612541519','bmguw.cmo@sail.in'],['Bhubaneswar','06742503892','bmbhu.cmo@sail.in'],
  ['Rourkela','06612601471','bmrou.cmo@sail.in'],['Ahmedabad','07927473565','bmahm.cmo@sail.in'],
  ['Nagpur','07122527742','bmnag.cmo@sail.in'],['Jaipur','01412372400','bmjai.cmo@sail.in'],
  ['Indore','07312437831','bmind.cmo@sail.in'],['Bhilai','07882224447','bmbhi.cmo@sail.in'],
  ['Chennai','04428285052','bmche.cmo@sail.in'],['Bengaluru','08022249909','bmban.cmo@sail.in'],
  ['Hyderabad','04023212102','bmhyd.cmo@sail.in'],['Kochi','04842380074','bmcoc.cmo@sail.in'],
  ['Coimbatore','04222216640','bmcoi.cmo@sail.in'],['Visakhapatnam','08912566124','bmviz.cmo@sail.in'],
];
export const additionalProspects:Row[]=[
  ...branches.map(([city,phone,email])=>({key:'sail-'+city.toLowerCase(),name:'SAIL — '+city+' sales office',city,area:city+' (sales office; confirm warehouse separately)',industry:'Steel distribution',sourceUrl:sail,phone:'+91'+phone.slice(1),email,contactSourceUrl:sail,contactCheckedOn:date,contactScope:'Published branch sales contact; not a transport booking desk',notes:'Ask for the relevant warehouse, transporter registration process and current material movement requirements. Branch contacts do not establish available loads.'})),
  ...['Bengaluru','Bhopal','Goindwal','Haridwar','Hyderabad','Jagdishpur','Jhansi','Rudrapur','Ranipet','Tiruchirappalli','Thirumayam','Visakhapatnam','Chennai'].map(city=>({key:'bhel-'+city.toLowerCase(),name:'BHEL — '+city+' manufacturing unit',city,area:city+' (confirm the specific unit/gate)',industry:'Industrial machinery & electrical equipment',sourceUrl:bhel,phone:'',email:'',contactSourceUrl:'',contactCheckedOn:'',contactScope:'Unit listed officially; logistics contact not established',notes:'Confirm unit-specific equipment, shipment dimensions, lifting and safe securing needs, and vendor/tender eligibility directly through the official unit listing.'})),
];
export const citySuggestions=['Agra','Ahmedabad','Angul','Aurangabad','Bengaluru','Bhilai','Bhopal','Bhubaneswar','Bokaro','Chandigarh','Chennai','Coimbatore','Cuttack','Dhanbad','Durgapur','Faridabad','Gaya','Ghaziabad','Goindwal','Gurugram','Guwahati','Hajipur','Haridwar','Hyderabad','Indore','Jabalpur','Jagdishpur','Jaipur','Jamshedpur','Jhansi','Kanpur','Kochi','Kolkata','Kota','Lucknow','Ludhiana','Mumbai','Muzaffarpur','Nagpur','Nashik','New Delhi','Noida','Patna','Patratu / Ramgarh','Pithampur','Pune','Raigarh','Raipur','Rajkot','Ranchi','Ranipet','Rourkela','Rudrapur','Salem','Siliguri','Surat','Thirumayam','Tiruchirappalli','Vadodara','Varanasi','Vijayawada','Visakhapatnam'];
export function cityProspects(rows:Row[],city:string,query=''){
  const normal=(s:unknown)=>String(s||'').trim().toLocaleLowerCase('en-IN');
  return rows.filter(p=>(city==='All cities'||normal(p.city)===normal(city)||normal(city)==='patna'&&normal(p.city)==='patna district')&&[p.name,p.city,p.area,p.industry,p.phone,p.email].some(v=>normal(v).includes(normal(query))));
}
