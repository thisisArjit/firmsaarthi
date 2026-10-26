import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from 'cloudflare:workers';
import { AuthService } from '@/lib/auth';
import AccountAccess from './access';
export const dynamic='force-dynamic';
export default async function Page(){
  const user=env.DB?await new AuthService(env.DB).user((await headers()).get('cookie')):null;
  if(!user)redirect('/');
  return <main className="dispatch-content"><div className="page-heading"><h1>My account</h1><a href="/" className="small">Back to workspace</a></div><p className="help">{user.email}</p><AccountAccess/></main>;
}
