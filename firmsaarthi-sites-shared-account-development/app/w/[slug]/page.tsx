import {WebsiteTemplate} from '../../website-template';
import { env } from 'cloudflare:workers';
import { SiteService,type SiteEnv } from '@/lib/site-service';
import { headers } from 'next/headers';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const site=await new SiteService(env as SiteEnv,new Request('https://sites.firmsaarthi.com')).publicSite(slug);return site?{title:site.brief.business+' — '+(site.brief.tagline||site.brief.city),description:site.brief.description.slice(0,160),alternates:{canonical:site.address},openGraph:{title:site.brief.business,description:site.brief.description.slice(0,160)}}:{title:'Website unavailable — Sites by FirmSaarthi',robots:{index:false,follow:false}};}
export default async function BusinessWebsite({params}:{params:Promise<{slug:string}>}) {
  const productOrigin=(env as SiteEnv).PUBLIC_URL||'https://sites.firmsaarthi.com';
  const {slug}=await params;
  const site=await new SiteService(env as SiteEnv,new Request('https://sites.firmsaarthi.com',{headers:await headers()})).publicSite(slug);
  if(!site) return <main className="site-unavailable"><a className="brand" href={productOrigin}><img src="/firmsaarthi-logo.png" alt="FirmSaarthi" width="40" height="40"/>Sites by FirmSaarthi</a><h1>This website is taking a little break.</h1><p>The owner can sign in to check their website or activate their annual plan.</p><a className="button primary" href={productOrigin+'/account'}>Manage my website ↗</a><a href="mailto:firmsaarthi@gmail.com">Contact FirmSaarthi</a></main>;
  return <WebsiteTemplate brief={site.brief} logo={site.assets.filter(a=>a.kind==='logo').at(-1)?'/api/assets/'+site.assets.filter(a=>a.kind==='logo').at(-1)!.id:undefined} photos={site.assets.filter(a=>a.kind==='photo').map(a=>'/api/assets/'+a.id)} productOrigin={productOrigin}/>;
}
