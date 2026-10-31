import { headers } from 'next/headers';
import { env } from 'cloudflare:workers';
import { AuthService } from '@/lib/auth';
import Login from './login';
import TransportDesk from './transport-desk';
import SubscriptionAccess from './subscription/access';
import {redirect} from 'next/navigation';
import {pendingSitesContinuation} from '@/lib/sites-account';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const user = env.DB ? await new AuthService(env.DB).user((await headers()).get('cookie')) : null;
  if(!user)return <Login/>;
  const sitesNext=pendingSitesContinuation((await headers()).get('cookie'));if(sitesNext)redirect(sitesNext);
  return <SubscriptionAccess><TransportDesk sitesSharedAccount={(env as any).FIRMSAARTHI_SSO_ENABLED==='true'} identity={{ email: user.email, name: user.email }} /></SubscriptionAccess>;
}
