// Only proofs for the current credential may authorize another product.
// A workspace manager's password replacement deliberately does not carry proof.
export function currentOwnershipSql(account='a'){
  if(account!=='a')throw new Error('Unsupported account alias');
  return `(EXISTS(SELECT 1 FROM account_email_proofs p WHERE p.user_id=a.user_id AND p.email=a.email AND p.credential_version=a.credential_version)
    OR EXISTS(SELECT 1 FROM shared_account_email_proofs p WHERE p.user_id=a.user_id AND p.email=a.email AND p.credential_version=a.credential_version)
    OR (a.password_hash LIKE 'google-only$%' AND a.email LIKE '%@gmail.com' AND EXISTS(SELECT 1 FROM google_identities g WHERE g.user_id=a.user_id AND g.email=a.email)))`;
}
