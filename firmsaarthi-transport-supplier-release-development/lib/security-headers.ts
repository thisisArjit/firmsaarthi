// Preserve streaming bodies, cookies and stricter route-specific protections.
// Full script/frame policies need payment and Sites embedding compatibility
// validation; this baseline must not claim to provide complete XSS protection.
export function securityHeaders(response:Response,requestUrl:string){
  if(response.status===101)return response;
  const headers=new Headers(response.headers);
  headers.set('X-Content-Type-Options','nosniff');
  if(!headers.has('Referrer-Policy'))headers.set('Referrer-Policy','strict-origin-when-cross-origin');
  headers.set('X-XSS-Protection','0');
  if(!headers.has('Content-Security-Policy'))headers.set('Content-Security-Policy',"base-uri 'self'; object-src 'none'");
  if(new URL(requestUrl).protocol==='https:'&&!headers.has('Strict-Transport-Security'))headers.set('Strict-Transport-Security','max-age=31536000');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
