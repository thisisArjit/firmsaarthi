export const TEMPLATES=[
 {id:'studio',name:'Studio',subtitle:'Clean portfolio & creative',color:'#e9ee9f',note:'Open space, strong type and an editorial layout.'},
 {id:'cafe',name:'Neighbourhood',subtitle:'Warm cafés & local businesses',color:'#d8b69a',note:'Warm neutrals, serif headings and a welcoming centred layout.'},
 {id:'clinic',name:'Professional',subtitle:'Consultants, clinics & services',color:'#bedbcf',note:'Calm colours, clear sections and rounded service panels.'},
 {id:'bold',name:'Spotlight',subtitle:'Shops, makers & modern brands',color:'#f8ad86',note:'A dark backdrop, large headlines and a vivid accent.'},
] as const;
export function resolveStyle(style:string,category=''){
 if(TEMPLATES.some(template=>template.id===style))return style;
 if(/food|caf[eé]|hospitality/i.test(category))return 'cafe';
 if(/health|professional|education/i.test(category))return 'clinic';
 if(/retail|shop/i.test(category))return 'bold';
 return 'studio';
}
export const TEMPLATE_REFERENCES=[
 {name:'Webflow · Small Portfolios',url:'https://webflow.com/templates/html/small-portfolios-portfolio-website-template'},
 {name:'Wix · Brasserie (Warm)',url:'https://www.wix.com/website/templates/html/restaurants-food/restaurant'},
 {name:'Wix · Business Consulting Agency (Elegant)',url:'https://www.wix.com/website-template/view/html/4558'},
 {name:'Squarespace · Paloma',url:'https://www.squarespace.com/templates/paloma-demo'},
];
