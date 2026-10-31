// Keep the website entry on the matching product environment. Only protected
// server configuration selects the origin; browser input never supplies it.
export function sitesWebsiteEntry(env:{APP_ENV?:unknown;SITES_ORIGIN?:unknown;FIRMSAARTHI_SSO_ENABLED?:unknown}){
  const expected=env.APP_ENV==='staging'
    ?'https://firmsaarthi-sites-private-staging.arjit-tiwari-ece14.chatgpt.site'
    :'https://sites.firmsaarthi.com';
  if((env.APP_ENV==='staging'||env.FIRMSAARTHI_SSO_ENABLED==='true')&&env.SITES_ORIGIN!==expected)return null;
  return expected+(env.FIRMSAARTHI_SSO_ENABLED==='true'?'/api/auth/firmsaarthi/start':'');
}
