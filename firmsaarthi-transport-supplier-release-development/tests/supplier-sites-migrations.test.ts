import {test,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
const sql=(name:string)=>readFileSync(`drizzle/${name}.sql`,'utf8');
const bridge37=readFileSync('tests/fixtures/migrations/production48-bridge0037.sql','utf8');
const journal=JSON.parse(readFileSync('drizzle/meta/_journal.json','utf8')).entries;
function baseline(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')&&f<'0038').sort())db.exec(readFileSync(`drizzle/${file}`,'utf8'));return db;}
function tables(db:DatabaseSync){return db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name);}
test('Supplier36 upgrade adds bridge without altering saved listing, receipt or ownership proof tables',()=>{
  const db=baseline();try{db.exec(sql('0038_supplier_portal'));db.exec(sql('0039_identity_ownership'));
    db.exec("INSERT INTO organizations(id,owner_id,name,created_at) VALUES('synthetic-org','synthetic-owner','Synthetic supplier','2026-10-31T00:00:00Z'); INSERT INTO workspace_business_modes VALUES('synthetic-org','supplier'); INSERT INTO supplier_listings(org_id,draft,version,updated_at) VALUES('synthetic-org','{\"trucks\":[{\"registration\":\"SYNTHETIC\"}]}',7,'2026-10-31T00:00:00Z'); INSERT INTO supplier_listing_requests VALUES('synthetic-org','synthetic-request','{}',7,'2026-10-31T00:00:00Z')");
    const before=db.prepare('SELECT * FROM supplier_listings').all(),receipts=db.prepare('SELECT * FROM supplier_listing_requests').all();
    db.exec(sql('0040_supplier_sites_bridge'));db.exec(sql('0040_supplier_sites_bridge'));
    expect(db.prepare('SELECT * FROM supplier_listings').all()).toEqual(before);expect(db.prepare('SELECT * FROM supplier_listing_requests').all()).toEqual(receipts);
    expect(tables(db)).toEqual(expect.arrayContaining(['sites_bridge_google','sites_bridge_orders','sites_bridge_nonces','signup_email_proofs','google_account_claims']));
  }finally{db.close();}
});
test('production48 upgrade by individual pending migration preserves bridge records and adds Supplier/ownership once',()=>{
  const db=baseline();try{db.exec(bridge37);db.exec("INSERT INTO sites_bridge_nonces VALUES('synthetic-nonce','2099-01-01'); INSERT INTO sites_bridge_orders(receipt,request_id,provider_id,payment_id,created_at) VALUES('synthetic-receipt','synthetic-request','order_Synthetic','pay_Synthetic','2026-10-31')");
    const orders=db.prepare('SELECT * FROM sites_bridge_orders').all(),nonces=db.prepare('SELECT * FROM sites_bridge_nonces').all();
    db.exec(sql('0038_supplier_portal'));db.exec(sql('0039_identity_ownership'));db.exec(sql('0040_supplier_sites_bridge'));
    expect(db.prepare('SELECT * FROM sites_bridge_orders').all()).toEqual(orders);expect(db.prepare('SELECT * FROM sites_bridge_nonces').all()).toEqual(nonces);
    expect(tables(db)).toEqual(expect.arrayContaining(['supplier_listings','supplier_listing_requests','workspace_business_modes','signup_email_proofs','google_account_claims']));
    expect(db.prepare('PRAGMA table_info(google_flows)').all().some(r=>r.name==='business_kind')).toBe(true);
    expect(()=>db.exec("INSERT INTO sites_bridge_orders(receipt,request_id,provider_id,created_at) VALUES('another','another','order_Synthetic','2026-10-31')")).toThrow(/UNIQUE/);
  }finally{db.close();}
});
test('timestamp-only migration selection is explicitly unsafe for production48 and cannot count as upgrade proof',()=>{
  const db=baseline();try{db.exec(bridge37);const productionLastWhen=1793386260631;
    const selected=journal.filter((e:{when:number})=>e.when>productionLastWhen);
    expect(selected.map((e:{tag:string})=>e.tag)).not.toContain('0038_supplier_portal');expect(selected.map((e:{tag:string})=>e.tag)).not.toContain('0039_identity_ownership');
    for(const e of selected)db.exec(sql(e.tag));
    expect(tables(db)).not.toContain('supplier_listings');expect(tables(db)).not.toContain('google_account_claims');
    // This test demonstrates the deployment blocker; it does NOT approve timestamp-only deployment.
  }finally{db.close();}
});
