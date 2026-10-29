import {AppError} from './service';
import {AuthService} from './auth';
import {digest,hashPassword,validatePassword} from './passwords';
import type {Row} from './domain';

export type RecoveryConfiguration={adminId:string;tokenHash:string;expiresAt:string};
const unavailable=()=>new AppError('This recovery link is invalid, expired or already used. Request a new link.',403);
// Provisioned only by the Site owner, for the already-pinned platform identity.
// The bearer token stays in the link fragment; only its hash reaches runtime configuration.
export async function recoverPlatformPassword(db:D1Database,config:RecoveryConfiguration,token:unknown,password:unknown,ip:string,clock=()=>new Date()){
  const at=clock(),expires=Date.parse(config.expiresAt);
  if(!config.adminId||!/^[a-f0-9]{64}$/.test(config.tokenHash)||!Number.isFinite(expires)||expires<=at.getTime())throw unavailable();
  await new AuthService(db).limit('platform-recovery:'+config.adminId,ip);
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)||await digest(token)!==config.tokenHash)throw unavailable();
  try{validatePassword(password);}catch{throw new AppError('Use a password of 8 to 128 characters.');}
  const claim='platform-recovery:'+config.tokenHash;
  if(await db.prepare('SELECT id FROM audit WHERE id=?').bind(claim).first())throw unavailable();
  const account=await db.prepare("SELECT a.user_id,a.credential_version,m.org_id FROM password_accounts a JOIN memberships m ON m.user_id=a.user_id JOIN organizations o ON o.id=m.org_id WHERE a.user_id=? AND a.disabled=0 AND m.role='OWNER' AND o.owner_id=a.user_id").bind(config.adminId).first<Row>();
  if(!account)throw unavailable();
  const hash=await hashPassword(password),version=crypto.randomUUID();
  // Recheck expiry after expensive password hashing. Claim+reset+revocation are one transaction.
  if(clock().getTime()>=expires)throw unavailable();
  let result:D1Result[];
  try{result=await db.batch([
    db.prepare('INSERT INTO audit(id,org_id,actor,action,target,created_at) VALUES(?,?,?,?,?,?)').bind(claim,account.org_id,account.user_id,'account.platform-recovery',account.user_id,clock().toISOString()),
    db.prepare('UPDATE password_accounts SET password_hash=?,credential_version=?,updated_at=? WHERE user_id=? AND credential_version=? AND disabled=0 RETURNING user_id').bind(hash,version,clock().toISOString(),account.user_id,account.credential_version),
    db.prepare('DELETE FROM auth_sessions WHERE user_id=?').bind(account.user_id),
  ]);}catch{throw unavailable();}
  if(!result[1].results?.length)throw unavailable();
  return {success:true};
}
