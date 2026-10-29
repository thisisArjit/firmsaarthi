CREATE TABLE workspace_starts(user_id TEXT PRIMARY KEY NOT NULL,org_id TEXT UNIQUE NOT NULL REFERENCES workspaces(id),request_id TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TRIGGER immutable_workspace_start_update BEFORE UPDATE ON workspace_starts BEGIN SELECT RAISE(ABORT,'Workspace creation records are immutable.');END;
CREATE TRIGGER immutable_workspace_start_delete BEFORE DELETE ON workspace_starts BEGIN SELECT RAISE(ABORT,'Workspace creation records are immutable.');END;
