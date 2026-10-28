CREATE TABLE workspaces(id TEXT PRIMARY KEY,name TEXT NOT NULL);
CREATE TABLE members(org_id TEXT NOT NULL REFERENCES workspaces(id),user_id TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('owner','operator','viewer','disabled')),PRIMARY KEY(org_id,user_id));
CREATE TABLE items(id TEXT NOT NULL,org_id TEXT NOT NULL REFERENCES workspaces(id),sku TEXT NOT NULL COLLATE NOCASE,name TEXT NOT NULL,unit TEXT NOT NULL CHECK(unit IN ('each','box','kg','litre','metre')),active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),PRIMARY KEY(org_id,id),UNIQUE(org_id,sku));
CREATE TABLE warehouses(id TEXT NOT NULL,org_id TEXT NOT NULL REFERENCES workspaces(id),code TEXT NOT NULL COLLATE NOCASE,name TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),PRIMARY KEY(org_id,id),UNIQUE(org_id,code));
CREATE TABLE balances(org_id TEXT NOT NULL,item_id TEXT NOT NULL,warehouse_id TEXT NOT NULL,quantity INTEGER NOT NULL DEFAULT 0 CHECK(typeof(quantity)='integer' AND quantity BETWEEN 0 AND 9000000000000),version INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(org_id,item_id,warehouse_id),FOREIGN KEY(org_id,item_id) REFERENCES items(org_id,id),FOREIGN KEY(org_id,warehouse_id) REFERENCES warehouses(org_id,id));
CREATE TABLE movements(id TEXT PRIMARY KEY,org_id TEXT NOT NULL,item_id TEXT NOT NULL,warehouse_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('receive','issue','adjust_in','adjust_out','reverse')),delta INTEGER NOT NULL CHECK(typeof(delta)='integer' AND delta<>0 AND abs(delta)<=9000000000000),reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 500),request_id TEXT NOT NULL,payload TEXT NOT NULL,actor TEXT NOT NULL,recorded_at TEXT NOT NULL,reverses TEXT REFERENCES movements(id),expected_version INTEGER,UNIQUE(org_id,request_id),FOREIGN KEY(org_id,item_id) REFERENCES items(org_id,id),FOREIGN KEY(org_id,warehouse_id) REFERENCES warehouses(org_id,id),FOREIGN KEY(org_id,actor) REFERENCES members(org_id,user_id));
CREATE UNIQUE INDEX one_reversal ON movements(reverses) WHERE reverses IS NOT NULL;
CREATE INDEX movement_history ON movements(org_id,item_id,warehouse_id,recorded_at,id);
CREATE TRIGGER immutable_movement_update BEFORE UPDATE ON movements BEGIN SELECT RAISE(ABORT,'Posted movements are immutable.');END;
CREATE TRIGGER immutable_movement_delete BEFORE DELETE ON movements BEGIN SELECT RAISE(ABORT,'Posted movements are immutable.');END;
CREATE TRIGGER immutable_item_unit BEFORE UPDATE OF unit ON items WHEN OLD.unit<>NEW.unit BEGIN SELECT RAISE(ABORT,'Base unit is immutable.');END;
CREATE TRIGGER validate_movement BEFORE INSERT ON movements BEGIN
 SELECT CASE WHEN NEW.kind IN ('adjust_in','adjust_out') AND (NEW.expected_version IS NULL OR typeof(NEW.expected_version)<>'integer' OR NEW.expected_version<>COALESCE((SELECT version FROM balances WHERE org_id=NEW.org_id AND item_id=NEW.item_id AND warehouse_id=NEW.warehouse_id),0)) THEN RAISE(ABORT,'Stock changed. Review the latest balance before adjusting.') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM members WHERE org_id=NEW.org_id AND user_id=NEW.actor AND (role='owner' OR (role='operator' AND NEW.kind IN ('receive','issue')))) THEN RAISE(ABORT,'Stock permission required.') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM items WHERE org_id=NEW.org_id AND id=NEW.item_id AND active=1) OR NOT EXISTS(SELECT 1 FROM warehouses WHERE org_id=NEW.org_id AND id=NEW.warehouse_id AND active=1) THEN RAISE(ABORT,'Active item and warehouse required.') END;
 SELECT CASE WHEN (NEW.kind IN ('receive','adjust_in') AND NEW.delta<0) OR (NEW.kind IN ('issue','adjust_out') AND NEW.delta>0) OR ((NEW.kind='reverse')<>(NEW.reverses IS NOT NULL)) THEN RAISE(ABORT,'Invalid movement direction.') END;
 SELECT CASE WHEN NEW.kind='reverse' AND NOT EXISTS(SELECT 1 FROM movements m WHERE m.id=NEW.reverses AND m.org_id=NEW.org_id AND m.item_id=NEW.item_id AND m.warehouse_id=NEW.warehouse_id AND m.kind<>'reverse' AND m.delta=-NEW.delta) THEN RAISE(ABORT,'Invalid reversal source.') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM items WHERE org_id=NEW.org_id AND id=NEW.item_id AND ((unit IN ('each','box') AND NEW.delta%1000000<>0) OR (unit IN ('kg','litre','metre') AND NEW.delta%1000<>0))) THEN RAISE(ABORT,'Quantity exceeds unit precision.') END;
END;
CREATE TRIGGER apply_movement AFTER INSERT ON movements BEGIN
 INSERT OR IGNORE INTO balances(org_id,item_id,warehouse_id) VALUES(NEW.org_id,NEW.item_id,NEW.warehouse_id);
 UPDATE balances SET quantity=quantity+NEW.delta,version=version+1 WHERE org_id=NEW.org_id AND item_id=NEW.item_id AND warehouse_id=NEW.warehouse_id;
END;
