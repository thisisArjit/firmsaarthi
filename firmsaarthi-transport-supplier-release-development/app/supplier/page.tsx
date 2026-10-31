import {headers} from 'next/headers';
import {env} from 'cloudflare:workers';
import {AuthService} from '@/lib/auth';
import Login from '../login';
import SupplierPortal from './portal';
export const dynamic='force-dynamic';
export default async function Page(){const user=env.DB?await new AuthService(env.DB).user((await headers()).get('cookie')):null;if(!user)return <Login portal="supplier"/>;return <SupplierPortal accountKey={user.userId} email={user.email}/>;}
