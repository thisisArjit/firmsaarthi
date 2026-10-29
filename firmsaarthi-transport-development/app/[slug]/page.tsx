import {env} from 'cloudflare:workers';
import {notFound} from 'next/navigation';
import {publishedWebsite} from '@/lib/company-website-service';
import CompanyWebsiteView from '../company-website-view';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const {slug}=await params,p=env.DB?await publishedWebsite(env.DB,slug):null;return {title:p?p.name+' | Transport & logistics':'Company website unavailable',description:p?p.headline:'',robots:p?{index:true,follow:true}:{index:false,follow:false}};}
export default async function CompanyPage({params}:{params:Promise<{slug:string}>}){const {slug}=await params,p=env.DB?await publishedWebsite(env.DB,slug):null;if(!p)notFound();return <CompanyWebsiteView profile={p}/>;}
