import {businessMode} from '@/lib/business-mode';
import {redirect} from 'next/navigation';
import { headers } from 'next/headers';
import { env } from 'cloudflare:workers';
import { AuthService } from '@/lib/auth';
import Login from './login';
import TransportDesk from './transport-desk';
import SubscriptionAccess from './subscription/access';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const user = env.DB ? await new AuthService(env.DB).user((await headers()).get('cookie')) : null;
  if(!user)return <Login/>;
  if(await businessMode(env.DB!,user.userId)==='supplier')redirect('/supplier');
  return <SubscriptionAccess><TransportDesk identity={{ email: user.email, name: user.email }} /></SubscriptionAccess>;
}
