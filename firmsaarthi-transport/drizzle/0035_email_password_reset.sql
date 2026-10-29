CREATE TABLE password_reset_requests (
 id TEXT PRIMARY KEY NOT NULL,
 subject_hash TEXT NOT NULL,
 user_id TEXT,
 org_id TEXT,
 role TEXT,
 account_email TEXT,
 credential_version TEXT,
 browser_hash TEXT NOT NULL,
 code_hash TEXT NOT NULL,
 reset_hash TEXT,
 completion_nonce TEXT,
 status TEXT NOT NULL CHECK(status IN ('pending','sent','failed','superseded','verified','consumed')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0 AND attempts<=5),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX password_reset_subject_time ON password_reset_requests(subject_hash,created_at);
CREATE INDEX password_reset_expiry ON password_reset_requests(expires_at);
