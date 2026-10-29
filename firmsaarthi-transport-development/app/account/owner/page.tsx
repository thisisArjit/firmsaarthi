import { requireChatGPTUser } from '@/app/chatgpt-auth';
import { env } from 'cloudflare:workers';
import OwnerRecovery from './recovery';
export const dynamic='force-dynamic';
export default async function Page(){
  const user=await requireChatGPTUser('/account/owner');
  const owner=await env.DB?.prepare("SELECT m.user_id FROM memberships m JOIN password_accounts a ON a.user_id=m.user_id WHERE m.user_id=? AND m.role='OWNER' AND a.disabled=0").bind(user.userId).first();
  if(!owner)return <main className="boot"><h1>Owner recovery unavailable</h1><p>This ChatGPT account is not the original workspace owner.</p><a href="/">Return to FirmSaarthi login</a></main>;
  return <OwnerRecovery/>;
}
