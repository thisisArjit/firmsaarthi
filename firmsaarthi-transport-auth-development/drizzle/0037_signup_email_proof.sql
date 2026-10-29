-- Additive only. No existing account, credential, membership or session changes.
CREATE TABLE signup_email_proofs (
 id TEXT PRIMARY KEY NOT NULL,
 subject_hash TEXT NOT NULL,
 email TEXT NOT NULL,
 browser_hash TEXT NOT NULL,
 code_hash TEXT NOT NULL,
 registration_hash TEXT,
 completion_digest TEXT,
 completion_nonce TEXT,
 user_id TEXT,
 org_id TEXT,
 credential_version TEXT,
 status TEXT NOT NULL CHECK(status IN ('pending','sent','failed','verified','consumed')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0 AND attempts<=5),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX signup_email_subject_time ON signup_email_proofs(subject_hash,created_at);
CREATE INDEX signup_email_expiry ON signup_email_proofs(expires_at);
-- Separate evidence; do not backfill legacy accounts as verified.
CREATE TABLE account_email_proofs (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES password_accounts(user_id),
 email TEXT NOT NULL,
 credential_version TEXT NOT NULL,
 method TEXT NOT NULL CHECK(method='signup_email_otp'),
 verified_at TEXT NOT NULL,
 request_id TEXT NOT NULL UNIQUE
);
