CREATE TABLE plan_checkout_orders (
 id TEXT PRIMARY KEY NOT NULL,
 org_id TEXT NOT NULL REFERENCES organizations(id),
 actor TEXT NOT NULL,
 request_id TEXT NOT NULL,
 receipt TEXT NOT NULL UNIQUE,
 tier TEXT NOT NULL CHECK(tier IN ('individual','team')),
 interval TEXT NOT NULL CHECK(interval IN ('monthly','yearly')),
 amount INTEGER NOT NULL CHECK(amount > 0),
 currency TEXT NOT NULL DEFAULT 'INR' CHECK(currency='INR'),
 mode TEXT NOT NULL CHECK(mode IN ('test','live')),
 status TEXT NOT NULL CHECK(status IN ('creating','ready','paid','review','failed')),
 provider_order_id TEXT UNIQUE,
 payment_id TEXT UNIQUE,
 grant_id TEXT UNIQUE REFERENCES subscription_grants(id),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(org_id, request_id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX plan_checkout_one_pending ON plan_checkout_orders(org_id) WHERE status IN ('creating','ready');
--> statement-breakpoint
CREATE TRIGGER plan_checkout_identity_immutable BEFORE UPDATE OF id,org_id,actor,request_id,receipt,tier,interval,amount,currency,mode,created_at ON plan_checkout_orders
BEGIN SELECT RAISE(ABORT,'Checkout identity and quoted price are immutable.'); END;
