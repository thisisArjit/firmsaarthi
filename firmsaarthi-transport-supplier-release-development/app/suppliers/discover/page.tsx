import {headers} from 'next/headers';
import {env} from 'cloudflare:workers';
import {redirect} from 'next/navigation';
import {AuthService} from '@/lib/auth';
import {businessMode} from '@/lib/business-mode';
import Directory from './directory';
export const dynamic='force-dynamic';
export default async function Page(){const user=env.DB?await new AuthService(env.DB).user((await headers()).get('cookie')):null;if(!user)redirect('/');if(await businessMode(env.DB!,user.userId)==='supplier')redirect('/supplier');return <Directory/>;}
