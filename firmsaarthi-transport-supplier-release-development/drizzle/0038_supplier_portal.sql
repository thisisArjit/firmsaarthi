CREATE TABLE IF NOT EXISTS workspace_business_modes (
  org_id TEXT PRIMARY KEY REFERENCES organizations(id),
  mode TEXT NOT NULL CHECK(mode IN ('transporter','supplier'))
);
ALTER TABLE google_flows ADD COLUMN business_kind TEXT NOT NULL DEFAULT 'transporter' CHECK(business_kind IN ('transporter','supplier'));
CREATE TABLE supplier_listings (
  org_id TEXT PRIMARY KEY REFERENCES organizations(id),
  draft TEXT NOT NULL DEFAULT '{}',
  published TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  updated_at TEXT NOT NULL,
  published_at TEXT
);
CREATE TABLE supplier_listing_requests (
  org_id TEXT NOT NULL REFERENCES organizations(id),
  request_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  result_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(org_id,request_id)
);
