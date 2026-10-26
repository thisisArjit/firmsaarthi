import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TransportService } from '../lib/service';
import { invoiceTotals, dateValue, money, type Row } from '../lib/domain';
import { invoicePdf, makePdf } from '../lib/pdf';
import { PDFDocument } from 'pdf-lib';
import { applyLegacyDatabase, verifyLegacyDatabase } from '../lib/legacy-database';
import { AuthService, cookieName, sessionCookie, sameOrigin } from '../lib/auth';
import { digest, hashPassword, verifyPassword } from '../lib/passwords';
import { normalizeEvent, parseTransportCsv } from '../lib/transport-events';
import { StaffService } from '../lib/staff-service';
import { PayrollService } from '../lib/payroll-service';
import { SupplierService } from '../lib/supplier-service';
import { AccountsService } from '../lib/accounts-service';
import { balanceReport } from '../lib/account-balances';
import { TripService } from '../lib/trip-service';
import { actualTime } from '../lib/trip-domain';
import { TripDocuments } from '../lib/trip-documents';
import { downloadableAsset, unscopedAsset } from '../lib/asset-access';
import { VehicleService } from '../lib/vehicle-service';
import { GpsService } from '../lib/gps-service';
import { GoogleAuth, googleConfig, flowCookie, flowCookieName, verifyGoogleToken } from '../lib/google-auth';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { SharedService } from '../lib/shared-service';
import { BusinessService } from '../lib/business-service';
import { workspaceFetch, workspaceChanged } from '../lib/workspace-sync';
import { productReleases, productRoadmap } from '../lib/product-updates';
import { BillingService, subscriptionAccess, nextBillingMonth, nextBillingPeriod } from '../lib/billing';
import { boundedBody } from '../lib/request-body';
import { billingContact, billingContactHref } from '../lib/billing-contact';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SubscriptionDetails, SubscriptionNotice } from '../app/subscription/access';
import { normalizeLocoNav,openGpsToken,sealGpsToken,pullLocoNav } from '../lib/gps-adapters';

function database(before=''){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')&&(!before||f<before)).sort())sqlite.exec(readFileSync(`drizzle/${file}`,'utf8'));
  class Statement {
    args:any[]=[];constructor(public sql:string){}bind(...args:any[]){this.args=args;return this;}
    async first(){return sqlite.prepare(this.sql).get(...this.args)||null;}
    async all(){return {results:sqlite.prepare(this.sql).all(...this.args)};}
    async run(){if(/\bRETURNING\b/i.test(this.sql)){const results=sqlite.prepare(this.sql).all(...this.args);return {success:true,results,meta:{changes:results.length}};}const result=sqlite.prepare(this.sql).run(...this.args);return {success:true,results:[],meta:{changes:result.changes}};}
  }
  return {sqlite,db:{prepare:(sql:string)=>new Statement(sql),batch:async(statements:Statement[])=>{sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}} as unknown as D1Database};
}
const year='2026-2027';const cn=(name='CN-1')=>({year,cn:name,date:'2026-10-24',company:'Acme Logistics',truck:'MH-01-AB-1234',origin:'Mumbai',destination:'Pune',rate:'1000',weight:'10',freight:'10000',advance:'1000',method:'Billed'});

test('subscription prompts follow access and four distinct cards show honest annual totals',()=>{
  const state={status:'trial',owner:true,admin:false,daysRemaining:10,business:'Synthetic',asOf:'2026-10-26T00:00:00Z',plan:{monthly_amount:199900,yearly_amount:1999900,team_monthly_amount:349900,team_yearly_amount:2999900,contact:'logistrace@gmail.com'},subscription:{trial_ends_at:'2026-11-05T00:00:00Z'},payments:[]};
  const notice=(s:Row)=>renderToStaticMarkup(createElement(SubscriptionNotice,{state:s}));assert.match(notice(state),/Upgrade your plan/);assert.doesNotMatch(notice(state),/₹|1,999|Annual/);
  for(const status of ['paid','exempt','administrator'])assert.doesNotMatch(notice({...state,status}),/Upgrade your plan/);
  assert.match(notice({...state,owner:false}),/View plans/);assert.doesNotMatch(notice({...state,owner:false}),/Upgrade your plan/);
  const html=renderToStaticMarkup(createElement(SubscriptionDetails,{state,onChange:()=>{}}));assert.equal((html.match(/<article /g)||[]).length,4);
  for(const label of ['Individual Monthly','Individual Annual','Team Monthly','Team Annual','₹1,999','₹19,999','₹3,499','₹29,999','Paid once for 12 months'])assert.ok(html.includes(label),label);
  assert.match(html,/<button class="primary" disabled="">Request activation/);
  const member=renderToStaticMarkup(createElement(SubscriptionDetails,{state:{...state,owner:false},onChange:()=>{}}));assert.doesNotMatch(member,/Request activation/);
  for(const status of ['exempt','administrator'])assert.doesNotMatch(renderToStaticMarkup(createElement(SubscriptionDetails,{state:{...state,status},onChange:()=>{}})),/Request activation/);
});

test('Individual and Team prices, requests, capacity guards and legacy access are safe',async()=>{
  const {db,sqlite}=database(),platform=new TransportService(db,{userId:'plan-admin',email:'admin@plans.test'}),customer=new TransportService(db,{userId:'plan-owner',email:'owner@plans.test'});await platform.command('workspace.create',{name:'Platform'});await customer.command('workspace.create',{name:'Plans'});const org=(await customer.member()).org_id,clock=()=>new Date('2030-01-01T00:00:00Z'),admin=new BillingService(platform,'plan-admin',clock),billing=new BillingService(customer,'plan-admin',clock);
  const addAccount=(id:string,disabled=0)=>sqlite.prepare('INSERT INTO password_accounts VALUES(?,?,?,?,?,?)').run(id,id+'@plans.test','synthetic-only','v1',disabled,'2030-01-01');addAccount('plan-owner');addAccount('plan-member');sqlite.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').run('plan-member',org,'member@plans.test','MEMBER','2030-01-01');
  let state=await billing.state();assert.equal(state.plan.team_monthly_amount,349900);assert.equal(state.plan.team_yearly_amount,2999900);
  await billing.command('request',{tier:'team',interval:'yearly'});state=await billing.state();assert.equal(state.subscription.requested_tier,'team');assert.equal(state.subscription.requested_interval,'yearly');await assert.rejects(()=>billing.command('request',{tier:'fake'}),/Individual or Team/);
  const base={orgId:org,version:state.subscription.version,reference:'TEAM-YEAR',confirmed:true,requestId:'team-year-payment',tier:'team',interval:'yearly',amount:2999900};await assert.rejects(()=>admin.command('grant',{...base,tier:'individual',amount:1999900}),/one active login/);await assert.rejects(()=>admin.command('grant',{...base,amount:1999900}),/price changed/);await admin.command('grant',base);state=await billing.state();assert.equal(state.payments[0].tier,'team');assert.equal(state.payments[0].amount,2999900);assert.equal((await admin.command('grant',base)).alreadyRecorded,true);
  await assert.rejects(()=>admin.command('grant',{...base,requestId:'change-tier-payment',tier:'individual',interval:'monthly',amount:199900,version:state.subscription.version}),/paid period ends/);
  sqlite.prepare('UPDATE subscriptions SET paid_until=NULL,plan_tier=\'legacy\' WHERE org_id=?').run(org);sqlite.prepare('UPDATE password_accounts SET disabled=1 WHERE user_id=?').run('plan-member');state=await billing.state();await admin.command('grant',{...base,requestId:'individual-month-payment',reference:'INDIVIDUAL-MONTH',tier:'individual',interval:'monthly',amount:199900,version:state.subscription.version});
  assert.throws(()=>sqlite.prepare('UPDATE password_accounts SET disabled=0 WHERE user_id=?').run('plan-member'),/one active login/);addAccount('plan-extra');assert.throws(()=>sqlite.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').run('plan-extra',org,'extra@plans.test','MEMBER','2030-01-01'),/one active login/);
  sqlite.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').run('late-account',org,'late@plans.test','MEMBER','2030-01-01');assert.throws(()=>addAccount('late-account'),/one active login/);
  state=await billing.state();await admin.command('exempt',{orgId:org,version:state.subscription.version,exempt:true,reason:'Synthetic complimentary'});assert.throws(()=>sqlite.prepare('UPDATE password_accounts SET disabled=0 WHERE user_id=?').run('plan-member'),/one active login/);
  sqlite.prepare('UPDATE subscriptions SET paid_until=NULL WHERE org_id=?').run(org);sqlite.prepare('UPDATE password_accounts SET disabled=0 WHERE user_id=?').run('plan-member');state=await billing.state();await admin.command('grant',{...base,requestId:'team-month-payment',reference:'TEAM-MONTH',tier:'team',interval:'monthly',amount:349900,version:state.subscription.version});assert.equal((await billing.state()).payments.find((p:Row)=>p.reference==='TEAM-MONTH')!.amount,349900);sqlite.close();
});

test('yearly access charges the yearly price, retains requested period and grants a calendar year safely',async()=>{
  const {db,sqlite}=database(),owner=new TransportService(db,{userId:'annual-admin',email:'admin@annual.test'}),customer=new TransportService(db,{userId:'annual-customer',email:'owner@annual.test'});await owner.command('workspace.create',{name:'Platform'});await customer.command('workspace.create',{name:'Annual customer'});sqlite.prepare('UPDATE organizations SET created_at=?').run('2026-01-01T00:00:00Z');
  const clock=()=>new Date('2026-10-26T00:00:00Z'),admin=new BillingService(owner,'annual-admin',clock),billing=new BillingService(customer,'annual-admin',clock),org=(await customer.member()).org_id;
  let state=await billing.state();assert.equal(state.plan.monthly_amount,199900);assert.equal(state.plan.yearly_amount,1999900);const trialEnd=state.subscription.trial_ends_at;
  await billing.command('request',{interval:'yearly'});state=await billing.state();assert.equal(state.subscription.requested_interval,'yearly');assert.equal(state.subscription.version,2);await billing.command('request',{interval:'yearly'});assert.equal((await billing.state()).subscription.version,2);
  await assert.rejects(()=>billing.command('request',{interval:'lifetime'}),/monthly or yearly/);
  const grant={orgId:org,version:state.subscription.version,interval:'yearly',amount:1999900,reference:'ANNUAL-RECEIPT-1',confirmed:true,requestId:'yearly-payment-once'};await assert.rejects(()=>admin.command('grant',{...grant,amount:199900}),/price changed/);await assert.rejects(()=>billing.command('grant',grant),/administrator/);
  await admin.command('grant',grant);state=await billing.state();assert.equal(state.subscription.paid_until,'2027-11-05T00:00:00.000Z');assert.equal(state.subscription.trial_ends_at,trialEnd);assert.equal(state.payments[0].interval,'yearly');assert.equal(state.payments[0].amount,1999900);assert.equal(state.payments[0].period_start,trialEnd);assert.equal((await admin.command('grant',grant)).alreadyRecorded,true);
  await assert.rejects(()=>admin.command('grant',{...grant,interval:'monthly',amount:199900}),/another payment/);await assert.rejects(()=>admin.command('grant',{...grant,requestId:'bad-annual-interval',interval:'invalid'}),/monthly or yearly/);
  await admin.command('policy',{trialDays:10,monthlyAmount:199900,yearlyAmount:2199900,contact:'logistrace@gmail.com',version:state.plan.version});assert.equal((await billing.state()).payments[0].amount,1999900);assert.equal((await billing.state()).subscription.paid_until,state.subscription.paid_until);
  assert.equal(nextBillingPeriod('2028-02-29T10:20:00.000Z','yearly'),'2029-02-28T10:20:00.000Z');assert.equal(nextBillingPeriod('2026-12-31T10:20:00.000Z','yearly'),'2027-12-31T10:20:00.000Z');sqlite.close();
});

test('yearly schema upgrade preserves old monthly grant payloads, dates and idempotent retries',async()=>{
  const {db,sqlite}=database('0019'),svc=new TransportService(db,{userId:'upgrade-admin',email:'upgrade@annual.test'});await svc.command('workspace.create',{name:'Upgrade'});const org=(await svc.member()).org_id,key='legacy-monthly-once',id=`subscription_${org}_${key}`,payload=JSON.stringify({reference:'LEGACY-MONTH',amount:199900});
  sqlite.prepare("INSERT INTO billing_policy VALUES('default',10,199900,'',1,'2026-10-26T00:00:00Z')").run();sqlite.prepare('INSERT INTO subscriptions(org_id,trial_started_at,trial_ends_at,paid_until) VALUES(?,?,?,?)').run(org,'2026-10-26T00:00:00.000Z','2026-11-05T00:00:00.000Z','2026-12-05T00:00:00.000Z');sqlite.prepare('INSERT INTO subscription_grants VALUES(?,?,?,?,?,?,?,?,?)').run(id,org,'2026-11-05T00:00:00.000Z','2026-12-05T00:00:00.000Z',199900,'LEGACY-MONTH','upgrade-admin','2026-10-26T00:00:00.000Z',payload);
  for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')&&f>='0019').sort())sqlite.exec(readFileSync('drizzle/'+file,'utf8'));
  const billing=new BillingService(svc,'upgrade-admin',()=>new Date('2026-10-26T01:00:00Z')),state=await billing.state();assert.equal(state.plan.yearly_amount,1999900);assert.equal(state.payments[0].interval,'monthly');assert.equal(state.subscription.paid_until,'2026-12-05T00:00:00.000Z');assert.equal((await svc.first('SELECT payload FROM subscription_grants WHERE id=?',id))!.payload,payload);assert.equal((await billing.command('grant',{orgId:org,requestId:key,amount:199900,reference:'LEGACY-MONTH',confirmed:true,version:1})).alreadyRecorded,true);sqlite.close();
});

test('manual payment contact defaults safely without replacing configured instructions or enabling checkout',async()=>{
  assert.equal(billingContact(''),'logistrace@gmail.com');assert.equal(billingContact('  '),'logistrace@gmail.com');assert.equal(billingContact(' billing@example.test '),'billing@example.test');assert.equal(billingContactHref('logistrace@gmail.com'),'mailto:logistrace@gmail.com');assert.equal(billingContactHref('Contact the office for payment'),null);assert.equal(billingContactHref('bad\r\n@example.test'),null);assert.ok(!billingContactHref('name?subject=value@example.test')!.includes('?'));
  const html=renderToStaticMarkup(createElement(SubscriptionDetails,{state:{status:'expired',business:'Synthetic',owner:true,plan:{monthly_amount:199900,yearly_amount:1999900,team_monthly_amount:349900,team_yearly_amount:2999900,contact:'logistrace@gmail.com'},subscription:{},payments:[]},onChange:()=>{}}));assert.ok(html.includes('href="mailto:logistrace@gmail.com"'));assert.ok(html.includes('For payment and activation, contact'));assert.ok(!html.includes('Online checkout is not connected yet.'));assert.ok(html.includes('Request activation'));
  const {db,sqlite}=database(),svc=new TransportService(db,{userId:'contact-owner',email:'owner@contact.test'}),billing=new BillingService(svc);let plan=await billing.policy();assert.equal(plan.contact,'logistrace@gmail.com');
  sqlite.prepare("UPDATE billing_policy SET contact='' WHERE id='default'").run();plan=await billing.policy();assert.equal(plan.contact,'logistrace@gmail.com');assert.equal((await svc.first("SELECT contact FROM billing_policy WHERE id='default'"))!.contact,'','Reading an existing blank policy does not rewrite configuration.');
  sqlite.prepare("UPDATE billing_policy SET contact='Call our billing office' WHERE id='default'").run();assert.equal((await billing.policy()).contact,'Call our billing office');sqlite.close();
});

test('bounded request reads consume rejected writes and release stream locks',async()=>{
  const request=new Request('https://local.test/api',{method:'POST',body:'Synthetic request'});assert.equal(new TextDecoder().decode(await boundedBody(request,100)),'Synthetic request');assert.equal(request.body!.locked,false);
  const oversized=new Request('https://local.test/api',{method:'POST',body:'Too long'});await assert.rejects(()=>boundedBody(oversized,3),e=>(e as any).status===413);assert.equal(oversized.body!.locked,false);
  const unicode=new Request('https://local.test/api',{method:'POST',body:'₹₹'});await assert.rejects(()=>boundedBody(unicode,5),e=>(e as any).status===413);assert.equal((await boundedBody(new Request('https://local.test'),100)).length,0);
});

test('10-day business trials expire server-side and exemptions require a pinned platform administrator',async()=>{
  const {db,sqlite}=database(),adminSvc=new TransportService(db,{userId:'platform-admin',email:'admin@billing.test'}),customerSvc=new TransportService(db,{userId:'customer-owner',email:'owner@billing.test'}),otherSvc=new TransportService(db,{userId:'other-customer',email:'other@billing.test'});
  for(const [svc,name] of [[adminSvc,'Platform'],[customerSvc,'Customer'],[otherSvc,'Other']] as const)await svc.command('workspace.create',{name});
  let now='2026-10-26T02:00:00.000Z';const clock=()=>new Date(now),admin=new BillingService(adminSvc,'platform-admin',clock),customer=new BillingService(customerSvc,'platform-admin',clock),other=new BillingService(otherSvc,'platform-admin',clock),org=(await customerSvc.member()).org_id;
  // Existing businesses get a full launch trial, never a retrospective expiry.
  sqlite.prepare('UPDATE organizations SET created_at=?').run('2026-10-01T00:00:00.000Z');let state=await customer.state();assert.equal(state.plan.trial_days,10);assert.equal(state.plan.monthly_amount,199900);assert.equal(state.daysRemaining,10);assert.equal(state.subscription.trial_ends_at,'2026-11-05T02:00:00.000Z');assert.equal(state.admin,false);assert.equal((await admin.state()).status,'administrator');
  sqlite.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').run('customer-member',org,'member@billing.test','MEMBER',now);const member=new BillingService(new TransportService(db,{userId:'customer-member',email:'member@billing.test'}),'platform-admin',clock);assert.equal((await member.state()).subscription.trial_ends_at,state.subscription.trial_ends_at);
  await admin.adminState();assert.equal(await otherSvc.first('SELECT org_id FROM subscriptions WHERE org_id=?',(await otherSvc.member()).org_id),null,'Listing customers must not initialize their subscription rows.');
  for(const actor of [customer,other,member]){await assert.rejects(()=>actor.adminState(),/administrator/);await assert.rejects(()=>actor.command('exempt',{orgId:org,exempt:true,reason:'Self bypass',version:1}),/administrator/);await assert.rejects(()=>actor.command('policy',{trialDays:365,monthlyAmount:100,version:1}),/administrator/);}
  now='2026-11-05T02:00:00.000Z';state=await customer.state();assert.equal(state.status,'expired');await assert.rejects(()=>customer.requireAccess(),e=>(e as any).status===402);assert.equal((await member.state()).status,'expired');
  await customer.command('request',{});await customer.command('request',{});state=await customer.state();assert.equal(state.subscription.version,2);assert.ok(state.subscription.requested_at);await assert.rejects(()=>member.command('request',{}),/workspace owner/);
  await admin.command('exempt',{orgId:org,exempt:true,reason:'Pilot customer',until:'2026-11-10T00:00:00Z',version:state.subscription.version});state=await customer.state();assert.equal(state.status,'exempt');assert.equal(state.subscription.exemption_reason,undefined);await customer.requireAccess();assert.equal((await member.state()).status,'exempt');assert.equal((await other.state()).status,'expired');
  await assert.rejects(()=>admin.command('exempt',{orgId:org,exempt:false,reason:'Stale attempt',version:1}),/changed/);
  now='2026-11-10T00:00:00.000Z';assert.equal((await customer.state()).status,'expired');
  await admin.command('exempt',{orgId:org,exempt:true,reason:'Permanent pilot',version:state.subscription.version});assert.equal((await customer.state()).status,'exempt');
  assert.ok(!JSON.stringify(await customerSvc.backup()).includes('Permanent pilot'),'Administrator exemption notes stay out of customer exports.');
  await admin.command('exempt',{orgId:org,exempt:false,reason:'Pilot ended',version:(await customer.state()).subscription.version});assert.equal((await customer.state()).status,'expired');
  const policy=(await admin.adminState()).plan;await admin.command('policy',{trialDays:15,monthlyAmount:249900,contact:'Support instructions',version:policy.version});assert.equal((await customer.state()).subscription.trial_ends_at,'2026-11-05T02:00:00.000Z');
  assert.throws(()=>sqlite.prepare('UPDATE subscriptions SET trial_ends_at=?').run('2099-01-01'),/immutable/);assert.equal((await adminSvc.rows("SELECT * FROM audit WHERE action='billing.exemption'")).length,3);sqlite.close();
});

test('manual monthly activations preserve paid history, request replay, price snapshots and company accounts',async()=>{
  const {db,sqlite}=database(),owner=new TransportService(db,{userId:'paid-platform',email:'admin@paid.test'}),svc=new TransportService(db,{userId:'paid-customer',email:'owner@paid.test'});await owner.command('workspace.create',{name:'Platform'});await svc.command('workspace.create',{name:'Paying customer'});await svc.command('consignment.save',cn('SUBSCRIPTION-CN'));
  let now='2026-10-26T00:00:00.000Z';const clock=()=>new Date(now),admin=new BillingService(owner,'paid-platform',clock),customer=new BillingService(svc,'paid-platform',clock),org=(await svc.member()).org_id;
  sqlite.prepare('UPDATE organizations SET created_at=?').run('2026-10-01T00:00:00Z');let state=await customer.state();const profit=(await svc.financeReport(year)).report.netProfit;
  const input={orgId:org,version:state.subscription.version,requestId:'monthly-payment-once',reference:'BANK-LOCAL-1',confirmed:true,amount:199900};await assert.rejects(()=>admin.command('grant',{...input,confirmed:false}),/verified receipt/);await assert.rejects(()=>admin.command('grant',{...input,amount:100}),/price changed/);
  await admin.command('grant',input);state=await customer.state();assert.equal(state.status,'paid');assert.equal(state.subscription.paid_until,'2026-12-05T00:00:00.000Z');assert.equal((await admin.command('grant',input)).alreadyRecorded,true);
  await assert.rejects(()=>admin.command('grant',{...input,reference:'Different'}),/another payment/);
  await assert.rejects(()=>admin.command('grant',{...input,requestId:'monthly-stale-attempt'}),/changed/);
  await assert.rejects(()=>admin.command('grant',{...input,version:state.subscription.version,requestId:'monthly-duplicate-ref'}),/UNIQUE/);assert.equal((await customer.state()).subscription.version,state.subscription.version);
  await admin.command('grant',{...input,version:state.subscription.version,requestId:'monthly-second-once',reference:'BANK-LOCAL-2'});assert.equal((await customer.state()).subscription.paid_until,'2027-01-05T00:00:00.000Z');
  now='2027-01-05T00:00:00.000Z';await assert.rejects(()=>customer.requireAccess(),e=>(e as any).status===402);
  await admin.command('grant',{...input,version:(await customer.state()).subscription.version,requestId:'monthly-renew-later',reference:'BANK-LOCAL-3'});assert.equal((await customer.state()).subscription.paid_until,'2027-02-05T00:00:00.000Z');
  assert.equal((await svc.financeReport(year)).report.netProfit,profit);const backup=await svc.backup();assert.equal(backup.records.subscription_grants.length,3);assert.equal(backup.records.subscriptions.length,1);assert.throws(()=>sqlite.prepare('UPDATE subscription_grants SET amount=1').run(),/immutable/);
  assert.equal(nextBillingMonth('2027-01-31T10:00:00.000Z'),'2027-02-28T10:00:00.000Z');assert.equal(nextBillingMonth('2028-01-31T10:00:00.000Z'),'2028-02-29T10:00:00.000Z');assert.equal(nextBillingMonth('2026-12-31T10:00:00.000Z'),'2027-01-31T10:00:00.000Z');
  assert.equal(subscriptionAccess({exempt:0,trial_ends_at:now,paid_until:now},now).allowed,false);sqlite.close();
});

test('required POD files gate acceptance, multi-consignment close and readiness without rewriting accounts',async()=>{
  const {db,sqlite}=database(),s=new TransportService(db,{userId:'policy-owner',email:'policy@example.test'}),other=new TransportService(db,{userId:'policy-other',email:'other@policy.test'});await s.command('workspace.create',{name:'Evidence policy'});await other.command('workspace.create',{name:'Other'});const org=(await s.member()).org_id;
  await s.command('consignment.save',cn('POLICY-1'));await s.command('consignment.save',cn('POLICY-2'));const consignments=(await s.state(year)).consignments,supplier=await s.command('account.save',{kind:'supplier',code:'POLICY',name:'Carrier'});
  const invoice=await s.command('invoice.create',{year,date:'2026-10-24',ids:[consignments[0].id],taxMode:'none'}),snapshot=(await s.owned('invoices',invoice.id,org)).snapshot,profit=(await s.financeReport(year)).report.netProfit;
  const input={year,number:'POLICY',registration:consignments[0].truck,supplierId:supplier.id,ids:consignments.map((c:Row)=>c.id),requestId:'required-pod-plan-once',podPolicy:'file_v1'};
  for(const role of ['MEMBER','DISPATCHER']){sqlite.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').run('policy-'+role,org,role+'@policy.test',role,'2026-10-26');await assert.rejects(()=>new TransportService(db,{userId:'policy-'+role,email:role+'@policy.test'}).command('trip.create',input),/Only the workspace owner/);}
  await assert.rejects(()=>s.command('trip.create',{...input,podPolicy:'unknown'}),/supported POD policy/);
  const trip=await s.command('trip.create',input),ts=new TripService(s);assert.equal((await s.command('trip.create',input)).alreadyRecorded,true);await assert.rejects(()=>s.command('trip.create',{...input,podPolicy:'reference_v1'}),/different trip details/);await assert.rejects(()=>new TripService(other).detail(trip.id),/not found/);
  let state=await ts.detail(trip.id),counter=0;const event=async(kind:string,extra:Row={})=>{state=await ts.detail(trip.id);return s.command('trip.event',{tripId:trip.id,version:state.trip.version,kind,eventAt:new Date().toISOString(),requestId:'policy-event-'+(++counter),...extra});};
  assert.equal(state.trip.pod_policy,'file_v1');assert.equal(state.requiredPodRemaining,2);assert.throws(()=>sqlite.prepare("UPDATE trips SET pod_policy='reference_v1' WHERE id=?").run(trip.id),/immutable/);await event('dispatch');
  const objects=new Map<string,Uint8Array>(),bucket={put:async(k:string,b:Uint8Array)=>{objects.set(k,b);},delete:async(k:string)=>{objects.delete(k);}} as unknown as R2Bucket,file={name:'Synthetic-POD.pdf',type:'application/pdf',bytes:new TextEncoder().encode('%PDF-1.4 synthetic')};
  const docs:Row[]=[];for(const item of consignments.map((c:Row)=>state.items.find((a:Row)=>a.consignment_id===c.id))){
    await event('delivery',{allocationId:item.id,reference:'Receiver'});await assert.rejects(()=>event('pod_accept',{allocationId:item.id,reference:'Reference without file'}),/requires an uploaded POD file/);await assert.rejects(()=>event('close'),/Accept an uploaded POD file/);
    state=await ts.detail(trip.id);const doc=await new TripDocuments(s).upload({tripId:trip.id,allocationId:item.id,version:state.trip.version,requestId:'policy-file-'+item.id},file,bucket);docs.push(doc);assert.equal((await ts.detail(trip.id)).requiredPodRemaining,2-docs.length+1);
    await event('pod_accept',{allocationId:item.id,documentId:doc.id,reference:'Reviewed file'});assert.equal((await ts.detail(trip.id)).requiredPodRemaining,2-docs.length);
  }
  state=await ts.detail(trip.id);assert.equal(state.readyToClose,true);assert.equal((await ts.state()).ready.length,1);
  const clerk=new TripService(new TransportService(db,{userId:'policy-MEMBER',email:'MEMBER@policy.test'})),safe=await clerk.detail(trip.id);assert.equal(safe.documents.length,0);assert.equal(safe.requiredPodRemaining,0);assert.equal(safe.items[0].podFileAccepted,true);
  const latest=state.active.at(-1);await event('correction',{targetEventId:latest.id,note:'Recheck source file'});state=await ts.detail(trip.id);assert.equal(state.readyToClose,false);assert.equal(state.requiredPodRemaining,1);assert.equal((await ts.state()).ready.length,0);
  await assert.rejects(()=>event('pod_accept',{allocationId:latest.allocation_id,documentId:docs[0].id,reference:'Wrong consignment'}),/belonging/);
  await event('pod_accept',{allocationId:latest.allocation_id,documentId:docs[1].id,reference:'Rechecked file'});
  state=await ts.detail(trip.id);await assert.rejects(()=>s.command('trip.event',{tripId:trip.id,version:state.trip.version-1,kind:'close',eventAt:new Date().toISOString(),requestId:'policy-stale-close'}),/trip changed/);
  await event('close');assert.equal((await ts.detail(trip.id)).status,'closed');assert.equal((await s.financeReport(year)).report.netProfit,profit);assert.equal((await s.owned('invoices',invoice.id,org)).snapshot,snapshot);assert.equal((await s.backup()).records.trips[0].pod_policy,'file_v1');sqlite.close();
});

test('POD policy migration preserves legacy trip payloads, versions and reference-only replay',async()=>{
  const {db,sqlite}=database('0021'),s=new TransportService(db,{userId:'legacy-policy',email:'legacy@policy.test'});await s.command('workspace.create',{name:'Legacy'});await s.command('consignment.save',cn('LEGACY-POLICY'));const c=(await s.state(year)).consignments[0],supplier=await s.command('account.save',{kind:'supplier',code:'LEG',name:'Carrier'}),org=(await s.member()).org_id;
  // Construct the previous schema row; the current service explicitly writes the new column.
  const vehicle=await s.first('SELECT id FROM trip_vehicles WHERE org_id=? AND registration=?',org,'MH01AB1234'),payload=JSON.stringify({year,number:'LEGACY',registration:'MH01AB1234',supplierId:supplier.id,ids:[c.id]});
  sqlite.prepare('INSERT INTO trips VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run('trip_'+org+'_legacy-policy-once',org,year,'LEGACY',vehicle!.id,'MH01AB1234',supplier.id,'Carrier','planned',1,payload,'2026-10-24','legacy-policy');
  const file=readdirSync('drizzle').find(f=>f.startsWith('0021')&&f.endsWith('.sql'))!;sqlite.exec(readFileSync('drizzle/'+file,'utf8'));const row=await s.first('SELECT * FROM trips');assert.equal(row!.pod_policy,'reference_v1');assert.equal(row!.creation_payload,payload);assert.equal(row!.version,1);assert.equal((await s.command('trip.create',{year,number:'LEGACY',registration:'MH01AB1234',supplierId:supplier.id,ids:[c.id],requestId:'legacy-policy-once'})).alreadyRecorded,true);sqlite.close();
});

test('private POD uploads retain reviewed and corrected evidence without changing financial history',async()=>{
  const {db,sqlite}=database(),s=new TransportService(db,{userId:'pod-owner',email:'pod@example.test'}),other=new TransportService(db,{userId:'pod-other',email:'other@pod.test'});
  await s.command('workspace.create',{name:'POD test'});await other.command('workspace.create',{name:'Other'});const org=(await s.member()).org_id;
  for(const role of ['MEMBER','DISPATCHER'])sqlite.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').run('pod-'+role,org,role+'@pod.test',role,'2026-10-26');
  const clerk=new TransportService(db,{userId:'pod-MEMBER',email:'MEMBER@pod.test'}),dispatcher=new TransportService(db,{userId:'pod-DISPATCHER',email:'DISPATCHER@pod.test'});
  await s.command('consignment.save',cn('POD-1'));const c=(await s.state(year)).consignments[0],supplier=await s.command('account.save',{kind:'supplier',code:'POD',name:'Carrier'}),invoice=await s.command('invoice.create',{year,date:'2026-10-24',ids:[c.id],taxMode:'none'});
  const snapshot=(await s.owned('invoices',invoice.id,org)).snapshot,profit=(await s.financeReport(year)).report.netProfit;
  const trip=await s.command('trip.create',{year,number:'POD-TRIP',registration:c.truck,supplierId:supplier.id,ids:[c.id],requestId:'pod-plan-once'}),ts=new TripService(s);let state=await ts.detail(trip.id),counter=0;
  const event=async(kind:string,extra:Row={})=>{state=await ts.detail(trip.id);return s.command('trip.event',{tripId:trip.id,version:state.trip.version,kind,eventAt:new Date().toISOString(),requestId:'pod-test-event-'+(++counter),...extra});};
  const objects=new Map<string,Uint8Array>(),bucket={put:async(k:string,b:Uint8Array)=>{objects.set(k,b);},delete:async(k:string)=>{objects.delete(k);}} as unknown as R2Bucket;
  const files=new TripDocuments(s),file={name:'Synthetic-POD.pdf',type:'application/pdf',bytes:new TextEncoder().encode('%PDF-1.4 synthetic')},input={tripId:trip.id,allocationId:state.items[0].id,version:state.trip.version,requestId:'pod-upload-once'};
  await assert.rejects(()=>files.upload(input,file,bucket),/delivered consignment/);await event('dispatch');await event('delivery',{allocationId:input.allocationId,reference:'Receiver'});state=await ts.detail(trip.id);input.version=state.trip.version;
  for(const actor of [clerk,dispatcher])await assert.rejects(()=>new TripDocuments(actor).upload(input,file,bucket),/owner/);
  await assert.rejects(()=>new TripDocuments(other).upload(input,file,bucket),/not found/);
  await assert.rejects(()=>files.upload({...input,allocationId:'foreign'},file,bucket),/delivered/);
  await assert.rejects(()=>files.upload(input,{...file,bytes:new Uint8Array()},bucket),/up to 2 MB/);
  await assert.rejects(()=>files.upload(input,{...file,bytes:new TextEncoder().encode('<script>bad</script>')},bucket),/match its type/);
  const uploaded=await files.upload(input,file,bucket);assert.equal(objects.size,1);assert.equal((await files.upload(input,file,bucket)).alreadyRecorded,true);assert.equal(objects.size,1);
  await assert.rejects(()=>files.upload(input,{...file,name:'Changed.pdf'},bucket),/another document/);
  state=await ts.detail(trip.id);const doc=state.documents[0];assert.equal(doc.status,'Awaiting review');assert.equal(doc.sha256.length,64);assert.equal(state.accepted,0);
  assert.equal((await downloadableAsset(s,doc.asset_id)).privateDocument,true);for(const actor of [clerk,dispatcher,other])await assert.rejects(()=>downloadableAsset(actor,doc.asset_id));
  assert.equal((await new TripService(clerk).detail(trip.id)).documents.length,0);assert.equal((await new TripService(dispatcher).detail(trip.id)).documents.length,0);
  await assert.rejects(()=>unscopedAsset(s,doc.asset_id,org),/Private documents/);
  await assert.rejects(()=>event('pod_accept',{allocationId:input.allocationId,documentId:'foreign',reference:'Bad review'}),/belonging/);
  await assert.rejects(()=>event('pod_accept',{allocationId:input.allocationId,documentId:doc.id,reference:'Early',eventAt:'2026-10-24T12:00:00Z'}),/before the document upload/);
  await event('pod_reject',{allocationId:input.allocationId,documentId:doc.id,note:'Receiver signature missing'});state=await ts.detail(trip.id);assert.equal(state.documents[0].status,'Rejected');
  const replacement=await files.upload({...input,requestId:'pod-replacement-file',version:state.trip.version},{...file,name:'Corrected-POD.pdf'},bucket);
  await event('pod_accept',{allocationId:input.allocationId,documentId:replacement.id,reference:'Reviewed signed delivery'});state=await ts.detail(trip.id);assert.equal(state.accepted,1);assert.equal(state.documents.find((d:Row)=>d.id===replacement.id).status,'Accepted');
  await assert.rejects(()=>files.upload({...input,requestId:'pod-accepted-replace',version:state.trip.version},file,bucket),/Correct or reject/);
  await event('correction',{targetEventId:state.active.at(-1).id,note:'Recheck receiver stamp'});state=await ts.detail(trip.id);assert.equal(state.accepted,0);assert.equal(state.documents.find((d:Row)=>d.id===replacement.id).status,'Awaiting review');assert.equal(state.documents.find((d:Row)=>d.id===replacement.id).reviews.length,1);
  assert.throws(()=>sqlite.prepare("UPDATE trip_documents SET sha256='changed'").run(),/immutable/);assert.throws(()=>sqlite.prepare("UPDATE trip_document_reviews SET document_id='changed'").run(),/immutable/);
  assert.equal((await s.owned('invoices',invoice.id,org)).snapshot,snapshot);assert.equal((await s.financeReport(year)).report.netProfit,profit);
  const backup=await s.backup();assert.equal(backup.records.trip_documents.length,2);assert.equal(backup.records.trip_document_reviews.length,2);sqlite.close();
});

test('losing POD upload version claims remove only their own objects and leave no orphan rows',async()=>{
  const {db,sqlite}=database(),s=new TransportService(db,{userId:'pod-race',email:'race@pod.test'});await s.command('workspace.create',{name:'Race'});await s.command('consignment.save',cn());const c=(await s.state(year)).consignments[0],supplier=await s.command('account.save',{kind:'supplier',code:'RACE',name:'Carrier'}),trip=await s.command('trip.create',{year,number:'RACE',registration:c.truck,supplierId:supplier.id,ids:[c.id],requestId:'race-trip-plan'}),ts=new TripService(s);
  let state=await ts.detail(trip.id);for(const kind of ['dispatch','delivery']){await s.command('trip.event',{tripId:trip.id,version:state.trip.version,kind,eventAt:new Date().toISOString(),allocationId:kind==='delivery'?state.items[0].id:null,reference:'Receiver',requestId:'race-event-'+kind});state=await ts.detail(trip.id);}
  const objects=new Map<string,Uint8Array>([['existing-object',new Uint8Array([1])]]),bucket={put:async(k:string,b:Uint8Array)=>{objects.set(k,b);sqlite.prepare('UPDATE trips SET version=version+1 WHERE id=?').run(trip.id);},delete:async(k:string)=>{objects.delete(k);}} as unknown as R2Bucket;
  await assert.rejects(()=>new TripDocuments(s).upload({tripId:trip.id,allocationId:state.items[0].id,version:state.trip.version,requestId:'race-upload-once'},{name:'POD.pdf',type:'application/pdf',bytes:new TextEncoder().encode('%PDF-synthetic')},bucket),/trip changed/);
  assert.equal(objects.size,1);assert.ok(objects.has('existing-object'));assert.equal((await ts.detail(trip.id)).documents.length,0);assert.equal((await s.rows('SELECT * FROM assets')).length,0);sqlite.close();
});

test('release notes describe shipped changes while the roadmap gates demand, evidence and trust work',()=>{
  assert.equal(new Set(productReleases.map(r=>r.id)).size,productReleases.length);for(const release of productReleases){assert.match(release.date,/^\d{4}-\d{2}-\d{2}$/);assert.ok(release.changes.length>0);}
  assert.equal(new Set(productRoadmap.map(r=>r.id)).size,productRoadmap.length);assert.equal(productRoadmap.filter(r=>r.status==='Next').length,1);assert.equal(productRoadmap[0].id,'trip-evidence');
  for(const key of ['shipper-loads','bids','kyc','ratings']){const item=productRoadmap.find(r=>r.id===key);assert.equal(item?.status,'Planned');assert.ok(item!.gate.length>30);}
  assert.match(productRoadmap.find(r=>r.id==='shipper-loads')!.scope.join(' '),/private pilot/);assert.match(productRoadmap.find(r=>r.id==='bids')!.scope.join(' '),/own submissions/);assert.match(productRoadmap.find(r=>r.id==='ratings')!.gate,/fabricated reviews/);
  assert.ok(productReleases.find(r=>r.id==='release-18')!.limits.some(s=>s.includes('Google sign-in is not enabled')));
});

test('shared trucks and suggestions follow all recording paths and years without rewriting history or widening access',async()=>{
  const {db,sqlite}=database(),svc=new TransportService(db,{userId:'shared-owner',email:'owner@shared.test'}),other=new TransportService(db,{userId:'other-shared',email:'other@shared.test'});
  await svc.command('workspace.create',{name:'Shared business'});await other.command('workspace.create',{name:'Other business'});const org=(await svc.member()).org_id;
  await svc.command('consignment.save',cn('SHARED-1'));const first=(await svc.state(year)).consignments[0];let shared=await new SharedService(svc).state();assert.equal(shared.vehicles[0].registration,'MH01AB1234');
  await svc.command('consignment.save',{...cn('SHARED-2'),truck:'mh01ab1234'});assert.equal((await new SharedService(svc).state()).vehicles.length,1);
  await svc.command('import.consignments',{year:'2025-2026',rows:[{...cn('OLD-YEAR'),date:'2025-10-24',truck:'UP-32-AB-9988',company:'All years customer',origin:'Patna',destination:'Delhi'}]});
  const added=await svc.command('vehicle.save',{registration:'BR-01-XY-1234'});assert.equal((await new TripService(svc).state()).vehicles.find((v:Row)=>v.registration==='BR01XY1234').id,added.id);assert.equal((await new GpsService(svc).state()).vehicles.find((v:Row)=>v.id===added.id).registration,'BR01XY1234');assert.ok((await new VehicleService(svc).state()).vehicles.some((v:Row)=>v.id===added.id));
  const historical=svc.consignment({...cn('HISTORICAL-TRUCK'),truck:'BR 02 XX 5678'},org,year);await db.batch([svc.insert('consignments',historical)]);
  await svc.command('integration.import',{kind:'gps_position',sourceReference:'Synthetic reference',rows:[{provider:'Synthetic source',externalId:'SHARED-POS',vehicle:'BR03AB4321',observedAt:'2026-10-24T10:30:00+05:30',latitude:25.6,longitude:85.1,speed:0}]});
  await svc.command('company.save',{name:'New customer without bookings',address:'Patna',gst:'Review required'});await svc.command('account.save',{kind:'supplier',code:'NEW-CARRIER',name:'New supplier without bookings'});
  shared=(await svc.state(year)).shared;for(const registration of ['MH01AB1234','UP32AB9988','BR01XY1234','BR02XX5678','BR03AB4321'])assert.ok(shared.vehicles.some((v:Row)=>v.registration===registration));
  assert.ok(shared.customers.some((c:Row)=>c.name==='All years customer'));assert.ok(shared.customers.some((c:Row)=>c.name==='New customer without bookings'));assert.ok(shared.suppliers.some((s:Row)=>s.name==='New supplier without bookings'));assert.ok(shared.locations.some((l:Row)=>l.name==='Patna'));
  assert.equal((await svc.owned('consignments',historical.id,org)).truck,'BR 02 XX 5678');assert.equal((await svc.owned('consignments',first.id,org)).truck,first.truck);
  assert.equal((await new SharedService(other).state()).vehicles.length,0);
  sqlite.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').run('shared-dispatcher',org,'dispatch@shared.test','DISPATCHER','2026-10-26');const dispatcher=new TransportService(db,{userId:'shared-dispatcher',email:'dispatch@shared.test'}),safe=(await dispatcher.state(year)).shared;assert.equal(safe.customers,undefined);assert.equal(safe.suppliers,undefined);assert.equal(safe.vehicles.length,shared.vehicles.length);sqlite.close();
});

test('researched prospects remain scoped and separate until reviewed customer conversion; issued documents stay intact',async()=>{
  const {db,sqlite}=database(),svc=new TransportService(db,{userId:'business-owner',email:'owner@business.test'}),other=new TransportService(db,{userId:'other-business',email:'other@business.test'});await svc.command('workspace.create',{name:'Business desk'});await other.command('workspace.create',{name:'Other'});const org=(await svc.member()).org_id;
  await svc.command('company.save',{name:'Existing customer',address:'Original address',gst:'Original GST'});await svc.command('consignment.save',{...cn('BUSINESS-1'),company:'Existing customer'});const consignment=(await svc.state(year)).consignments[0],invoice=await svc.command('invoice.create',{year,date:'2026-10-24',ids:[consignment.id],taxMode:'none'}),before=(await svc.owned('invoices',invoice.id,org)).snapshot;
  const input={name:'Potential industrial customer',city:'Patna',area:'Fatuha',industry:'Industrial goods',sourceUrl:'https://example.com/company',notes:'Synthetic research only',status:'research'},lead=await svc.command('business.lead.save',input);assert.equal((await svc.command('business.lead.save',input)).id,lead.id);assert.equal((await svc.state(year)).companies.length,1);
  assert.equal((await new BusinessService(other).state()).leads.length,0);await assert.rejects(()=>other.command('business.lead.customer',{id:lead.id,version:1}),/not found/);await assert.rejects(()=>svc.command('business.lead.save',{...input,name:'Bad URL',sourceUrl:'javascript:alert(1)'}),/HTTPS/);
  await svc.command('business.lead.save',{...input,id:lead.id,version:1,status:'contacted'});await assert.rejects(()=>svc.command('business.lead.customer',{id:lead.id,version:1}),/changed/);
  const converted=await svc.command('business.lead.customer',{id:lead.id,version:2});assert.equal((await svc.command('business.lead.customer',{id:lead.id,version:2})).id,converted.id);let state=await svc.state(year);assert.ok(state.shared.customers.some((c:Row)=>c.name===input.name));assert.equal(state.companies.find((c:Row)=>c.id===converted.id).gst,'');assert.equal(state.invoices.length,1);assert.equal((await svc.owned('invoices',invoice.id,org)).snapshot,before);
  const existing=await svc.command('business.lead.save',{...input,name:'Existing customer'});await svc.command('business.lead.customer',{id:existing.id,version:1});state=await svc.state(year);assert.equal(state.companies.filter((c:Row)=>c.name==='Existing customer').length,1);assert.equal(state.companies.find((c:Row)=>c.name==='Existing customer').gst,'Original GST');
  assert.equal((await svc.backup()).records.business_leads.length,2);assert.equal((await svc.financeReport(year)).report.revenue,1000000);
  sqlite.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').run('business-dispatch',org,'dispatch@business.test','DISPATCHER','2026-10-26');const dispatcher=new TransportService(db,{userId:'business-dispatch',email:'dispatch@business.test'});await assert.rejects(()=>new BusinessService(dispatcher).state(),/Dispatcher access/);await assert.rejects(()=>dispatcher.command('business.lead.save',input),/Dispatcher access/);sqlite.close();
});

test('business fetch invalidation retries an older read without caching or broadcasting record data',async()=>{
  const original=globalThis.fetch;let resolveOld:(value:Response)=>void=()=>{},reads=0;
  try{
    globalThis.fetch=(async(_input:RequestInfo|URL,init?:RequestInit)=>{if(init?.method==='POST')return Response.json({success:true});reads++;if(reads===1)return new Promise<Response>(resolve=>{resolveOld=resolve;});return Response.json({revision:'new'});}) as typeof fetch;
    const oldRead=workspaceFetch('/api/tms?year=2026-2027');await workspaceFetch('/api/tms',{method:'POST',body:'{}'});resolveOld(Response.json({revision:'old'}));assert.deepEqual(await (await oldRead).json(),{revision:'new'});assert.equal(reads,2);
    workspaceChanged();assert.deepEqual(await (await workspaceFetch('/api/tms?view=business')).json(),{revision:'new'});
  }finally{globalThis.fetch=original;}
});

test('password signup isolates new businesses, retains existing accounts and uses normal revocable sessions',async()=>{
  const {db,sqlite}=database(),auth=new AuthService(db),password='Synthetic signup password 123!';
  const token=await auth.signup(' NEW@signup.test ',password,'New business','signup-1'),identity=await auth.user(`${cookieName()}=${token}`);assert.ok(identity);
  const svc=new TransportService(db,identity!),member=await svc.member();assert.equal(member.role,'OWNER');assert.equal(member.email,'new@signup.test');
  const org=await svc.first('SELECT * FROM organizations WHERE id=?',member.org_id);assert.equal(org!.name,'New business');assert.equal(JSON.parse(org!.profile).transportName,'New business');
  await svc.command('consignment.save',cn('PRIVATE-SIGNUP-1'));
  const second=await auth.signup('second@signup.test',password,'Second business','signup-2'),secondIdentity=await auth.user(`${cookieName()}=${second}`),secondService=new TransportService(db,secondIdentity!);assert.equal((await secondService.state(year)).consignments.length,0);assert.notEqual((await secondService.member()).org_id,member.org_id);
  await assert.rejects(()=>auth.signup('new@signup.test',password,'Attempted duplicate','signup-3'),/Unable to create/);assert.equal(sqlite.prepare('SELECT count(*) n FROM organizations').get()!.n,2);
  await assert.rejects(()=>auth.signup('invalid','short','Name','signup-4'),/email/);await assert.rejects(()=>auth.signup('valid@signup.test','short','Name','signup-4'),/12 to 128/);
  assert.equal((await auth.user(`${cookieName()}=${await auth.login('new@signup.test',password,'signup-5')}`))!.userId,identity!.userId);
  await auth.logout(`${cookieName()}=${token}`);assert.equal(await auth.user(`${cookieName()}=${token}`),null);
  for(let i=0;i<5;i++)await auth.limit('signup:abuse','signup-abuse');await assert.rejects(()=>auth.limit('signup:abuse','signup-abuse'),/Too many/);sqlite.close();
});

test('Google flows bind browser, expire, resist replay and require matching email plus password before linking',async()=>{
  const {db,sqlite}=database(),auth=new AuthService(db),config={clientId:'test-client',clientSecret:'synthetic-only',redirectUri:'https://logistrace.test/api/auth/google/callback'},google=new GoogleAuth(db,config),password='Synthetic linking password 123!';
  assert.equal(googleConfig({}),null);assert.equal(googleConfig({GOOGLE_CLIENT_ID:'id',GOOGLE_CLIENT_SECRET:'secret',GOOGLE_REDIRECT_URI:'https://site.test/callback'}),null);
  const token=await auth.signup('existing@google.test',password,'Original business','google-1'),cookie=`${cookieName()}=${token}`,identity=(await auth.user(cookie))!;
  const svc=new TransportService(db,identity);await svc.command('consignment.save',cn('GOOGLE-KEEP-1'));
  await assert.rejects(()=>google.start('link','',cookie,'incorrect','google-2'),/password/);await assert.rejects(()=>google.start('link','',null,password,'google-3'),/Sign in/);
  const started=await google.start('link','',cookie,password,'google-4'),url=new URL(started.url),state=url.searchParams.get('state')!;
  assert.equal(url.origin,'https://accounts.google.com');assert.equal(url.searchParams.get('scope'),'openid email');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.ok(flowCookie(started.browser).includes('HttpOnly'));
  await assert.rejects(()=>google.consume(state,'0'.repeat(64)),/expired/);
  const flow=await google.consume(state,started.browser);assert.equal(flow.user_id,identity.userId);await assert.rejects(()=>google.consume(state,started.browser),/expired/);
  await assert.rejects(()=>google.complete(flow,{subject:'google-sub-1',email:'other@google.test'},cookie),/same email/);
  const loginToken=await google.complete(flow,{subject:'google-sub-1',email:'existing@google.test'},cookie);assert.equal((await auth.user(`${cookieName()}=${loginToken}`))!.userId,identity.userId);
  const standalone={...flow,intent:'login'};const stable=await google.complete(standalone,{subject:'google-sub-1',email:'changed-email@google.test'},null);assert.equal((await auth.user(`${cookieName()}=${stable}`))!.userId,identity.userId);
  assert.equal((await svc.state(year)).consignments[0].cn,'GOOGLE-KEEP-1');assert.equal(sqlite.prepare('SELECT count(*) n FROM organizations').get()!.n,1);
  await assert.rejects(()=>google.complete({...flow,intent:'signup',business_name:'Do not merge'},{subject:'different-sub',email:'existing@google.test'},null),/existing password/);
  const expiring=await google.start('login','',null,'','google-5');sqlite.exec('UPDATE google_flows SET expires_at=0');await assert.rejects(()=>google.consume(new URL(expiring.url).searchParams.get('state')!,expiring.browser),/expired/);
  sqlite.prepare('UPDATE password_accounts SET disabled=1 WHERE user_id=?').run(identity.userId);await assert.rejects(()=>google.complete(standalone,{subject:'google-sub-1',email:'existing@google.test'},null),/unavailable/);assert.equal(await auth.user(cookie),null);sqlite.close();
});

test('Google signup is explicit, creates an isolated workspace, never grants invitation access, and checks credential changes',async()=>{
  const {db,sqlite}=database(),auth=new AuthService(db),google=new GoogleAuth(db,{clientId:'test-client',clientSecret:'synthetic-only',redirectUri:'https://logistrace.test/api/auth/google/callback'});
  const owner=new TransportService(db,{userId:'original-owner',email:'owner@google.test'});await owner.command('workspace.create',{name:'Original'});await owner.command('team.invite',{email:'new@google.test'});
  await assert.rejects(()=>google.complete({intent:'login'},{subject:'new-sub',email:'new@google.test'},null),/No linked account/);
  const token=await google.complete({intent:'signup',business_name:'New Google business'},{subject:'new-sub',email:'new@google.test'},null),identity=(await auth.user(`${cookieName()}=${token}`))!,svc=new TransportService(db,identity);assert.equal((await svc.member()).role,'OWNER');assert.notEqual((await svc.member()).org_id,(await owner.member()).org_id);
  await assert.rejects(async()=>svc.command('invitation.accept',{id:(await owner.rows('SELECT * FROM invitations'))[0].id}),/current team/);await assert.rejects(()=>auth.login('new@google.test','anything','google-only-password'),/incorrect/);
  const password='Synthetic role-change test 123!',existing=await auth.signup('change@google.test',password,'Change test','change-1'),cookie=`${cookieName()}=${existing}`,start=await google.start('link','',cookie,password,'change-2'),flow=await google.consume(new URL(start.url).searchParams.get('state')!,start.browser);
  sqlite.prepare('UPDATE password_accounts SET credential_version=? WHERE user_id=?').run('new-version',flow.user_id);await assert.rejects(()=>google.complete(flow,{subject:'change-sub',email:'change@google.test'},cookie),/Sign in again/);assert.equal(sqlite.prepare("SELECT count(*) n FROM google_identities WHERE subject='change-sub'").get()!.n,0);sqlite.close();
});

test('Google ID tokens require valid signatures, issuer, audience, freshness, nonce and verified email',async()=>{
  const pair=await generateKeyPair('RS256'),publicKey=await exportJWK(pair.publicKey),key=createLocalJWKSet({keys:[{...publicKey,kid:'test-key',alg:'RS256'}]}),seconds=Math.floor(Date.now()/1000);
  const sign=(claims:Row={})=>new SignJWT({iss:'https://accounts.google.com',aud:'test-client',sub:'subject-123',email:'verified@google.test',email_verified:true,nonce:'nonce-123',iat:seconds,exp:seconds+300,...claims}).setProtectedHeader({alg:'RS256',kid:'test-key'}).sign(pair.privateKey);
  assert.deepEqual(await verifyGoogleToken(await sign(),'test-client','nonce-123',key),{subject:'subject-123',email:'verified@google.test'});
  for(const claims of [{iss:'https://evil.test'},{aud:'other-client'},{nonce:'wrong'},{email_verified:false},{azp:'other-client'},{exp:seconds-60},{iat:seconds-900}])await assert.rejects(()=>sign(claims).then(t=>verifyGoogleToken(t,'test-client','nonce-123',key)));
  const token=await sign();await assert.rejects(()=>verifyGoogleToken(token.slice(0,-12)+'AAAAAAAAAAAA','test-client','nonce-123',key));
});

test('dispatcher access omits commercial fields, permits operational progress and audits scoped role changes',async()=>{
  const {db,sqlite}=database(),owner=new TransportService(db,{userId:'access-owner',email:'owner@access.test'}),other=new TransportService(db,{userId:'access-other',email:'other@access.test'});await owner.command('workspace.create',{name:'Dispatch company'});await other.command('workspace.create',{name:'Other'});const org=(await owner.member()).org_id;
  await owner.command('profile.save',{transportName:'Dispatch company',bankName:'Private bank',accountNumber:'SENSITIVE-BANK'});
  await owner.command('consignment.save',cn('DISPATCH-1'));const original=(await owner.state(year)).consignments[0],supplier=await owner.command('account.save',{kind:'supplier',name:'Reviewed carrier',code:'CARRIER-1'});
  await owner.command('team.create',{email:'dispatch@access.test',password:'Synthetic dispatcher 123!'});const account=await owner.first('SELECT * FROM memberships WHERE email=?','dispatch@access.test');assert.equal(account!.role,'DISPATCHER');
  const dispatcher=new TransportService(db,{userId:account!.user_id,email:account!.email}),auth=new AuthService(db),token=await auth.login(account!.email,'Synthetic dispatcher 123!','access-test');
  const state=await dispatcher.state(year);assert.deepEqual(Object.keys(state.consignments[0]).sort(),['id','year','cn','date','company','truck','origin','destination'].sort());assert.equal(state.invoices.length,0);assert.equal(state.team.length,0);assert.equal(state.business.profile,undefined);assert.ok(!JSON.stringify(state).includes('SENSITIVE-BANK'));
  const blocked=['consignment.save','consignment.delete','payments.save','invoice.create','invoice.paid','receipt.create','finance.save','staff.employee.save','supplier.cost.save','account.save','integration.import','vehicle.save','gps.sync','team.create','team.role','workspace.create'];for(const action of blocked)await assert.rejects(()=>dispatcher.command(action,{id:original.id,...cn()}),/Dispatcher access/);
  await assert.rejects(()=>dispatcher.backup(),/owner/);await assert.rejects(()=>dispatcher.financeReport(year),/owner/);await assert.rejects(()=>new SupplierService(dispatcher).history(original.id),/Dispatcher access/);
  const plan={year,number:'DISPATCH-TRIP',registration:'MH01AB1234',supplierId:supplier.id,ids:[original.id],requestId:'dispatch-plan-once'},trip=await dispatcher.command('trip.create',plan);const ops=new TripService(dispatcher),register=await ops.state();assert.equal(register.commercial,false);assert.equal(register.ready.length,0);assert.ok(register.eligible.every((r:Row)=>!('freight' in r)));
  let detail=await ops.detail(trip.id);assert.equal(detail.items[0].snapshot.freight,undefined);assert.equal(detail.items[0].current_freight,undefined);assert.equal(detail.items[0].invoice_id,undefined);assert.equal(detail.trip.creation_payload,undefined);
  const event=(kind:string,extra:Row={})=>dispatcher.command('trip.event',{tripId:trip.id,version:detail.trip.version,kind,eventAt:'2026-10-25T01:00:00Z',requestId:'dispatcher-'+kind.replaceAll('_','-'),...extra});
  await event('dispatch');detail=await ops.detail(trip.id);await event('delivery',{allocationId:detail.items[0].id,reference:'Receiver acknowledged synthetic load'});detail=await ops.detail(trip.id);await event('exception',{note:'Synthetic delay'});detail=await ops.detail(trip.id);await event('exception_resolve',{targetEventId:detail.exceptions[0].id,note:'Synthetic delay resolved'});detail=await ops.detail(trip.id);assert.equal(detail.delivered,1);assert.equal(detail.exceptions.length,0);
  for(const kind of ['pod_accept','pod_reject','close','cancel','correction'])await assert.rejects(()=>event(kind),/owner/);assert.equal((await owner.state(year)).consignments[0].freight,original.freight);
  await assert.rejects(()=>other.command('team.role',{id:account!.user_id,expectedRole:'DISPATCHER',role:'MEMBER'}),/non-owner team/);await assert.rejects(()=>owner.command('team.role',{id:'access-owner',expectedRole:'MEMBER',role:'DISPATCHER'}),/non-owner team/);await assert.rejects(()=>owner.command('team.role',{id:account!.user_id,expectedRole:'MEMBER',role:'DISPATCHER'}),/changed/);
  await owner.command('team.role',{id:account!.user_id,expectedRole:'DISPATCHER',role:'MEMBER'});assert.equal(await auth.user(`${cookieName()}=${token}`),null);assert.equal((await dispatcher.state(year)).consignments[0].freight,original.freight);assert.equal((await owner.backup()).records.team.find((r:Row)=>r.user_id===account!.user_id).role,'MEMBER');
  await owner.command('team.role',{id:account!.user_id,expectedRole:'MEMBER',role:'DISPATCHER'});assert.equal((await dispatcher.state(year)).consignments[0].freight,undefined);assert.equal((await owner.rows("SELECT * FROM audit WHERE org_id=? AND action='team.role'",org)).length,2);
  sqlite.prepare("UPDATE memberships SET role='UNKNOWN' WHERE user_id=?").run(account!.user_id);await assert.rejects(()=>dispatcher.state(year),/supported workspace access/);await assert.rejects(()=>dispatcher.command('trip.create',plan),/supported workspace access/);sqlite.close();
});

test('vehicle documents retain source, reviewed dates, private attachment scope and reasoned corrections',async()=>{
  const {db,sqlite}=database(),svc=new TransportService(db,{userId:'vehicle-owner',email:'vehicle@example.com'}),other=new TransportService(db,{userId:'vehicle-other',email:'other@example.com'});await svc.command('workspace.create',{name:'Vehicles'});await other.command('workspace.create',{name:'Other'});const org=(await svc.member()).org_id;
  sqlite.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').run('vehicle-member',org,'member@example.com','MEMBER','2026-10-25');const member=new TransportService(db,{userId:'vehicle-member',email:'member@example.com'}),vs=new VehicleService(svc);
  const vehicle=await svc.command('vehicle.save',{registration:'MH-01-AB-1234'});assert.equal((await svc.command('vehicle.save',{registration:'MH01AB1234'})).id,vehicle.id);
  await svc.db.batch([svc.insert('assets',{id:'private-vehicle-pdf',org_id:org,name:'Synthetic RC.pdf',mime:'application/pdf',created_at:'2026-10-25'}),svc.insert('asset_scopes',{asset_id:'private-vehicle-pdf',org_id:org,purpose:'vehicle_document'})]);
  const input={vehicleId:vehicle.id,kind:'rc',number:'SYNTHETIC-RC-1',issuedOn:'2026-10-24',validUntil:'2027-10-24',sourceReference:'Owner supplied RC document',assetId:'private-vehicle-pdf',details:{manufacturer:'Synthetic maker',payloadKg:10000},requestId:'vehicle-document-once'},doc=await svc.command('vehicle.document.add',input);
  assert.equal((await svc.command('vehicle.document.add',input)).alreadyRecorded,true);await assert.rejects(()=>svc.command('vehicle.document.add',{...input,number:'Different'}),/different document/);assert.equal((await vs.state()).latestDocuments[0].reviews.length,0,'recording a document is not verification');
  await svc.command('vehicle.document.review',{id:doc.id,version:1,method:'document_review',checkedOn:'2026-10-25',reference:'Owner matched RC fields to supplied document'});await assert.rejects(()=>svc.command('vehicle.document.review',{id:doc.id,version:1,method:'official_manual_check',checkedOn:'2026-10-25',reference:'Stale review'}),/changed/);
  await assert.rejects(()=>new VehicleService(member).state(),/owner/);await assert.rejects(()=>member.command('vehicle.document.review',{id:doc.id}),/owner/);await assert.rejects(()=>other.command('vehicle.document.add',{...input,requestId:'other-vehicle-document'}),/not found/);
  await assert.rejects(()=>svc.command('vehicle.document.add',{...input,requestId:'invalid-vehicle-dates',validUntil:'2026-10-23'}),/before issue/);assert.throws(()=>sqlite.prepare("UPDATE vehicle_documents SET number='changed'").run(),/immutable/);
  await svc.command('vehicle.document.void',{id:doc.id,version:2,reason:'Incorrect source; replacing with corrected RC'});const state=await vs.state();assert.equal(state.latestDocuments.length,0);assert.equal(state.documents[0].status,'void');assert.equal(state.documents[0].reviews.length,1);assert.equal((await svc.backup()).records.vehicle_documents.length,1);assert.equal((await svc.financeReport(year)).report.netProfit,0);sqlite.close();
});

test('GPS adapters scope fixes, encrypt credentials, bound network reads and preserve synchronization history',async()=>{
  const {db,sqlite}=database(),key=btoa('a'.repeat(32)),svc=new TransportService(db,{userId:'gps-owner',email:'gps@example.com'}),other=new TransportService(db,{userId:'gps-other',email:'other@example.com'});await svc.command('workspace.create',{name:'GPS'});await other.command('workspace.create',{name:'Other'});const org=(await svc.member()).org_id;
  const vehicle=await svc.command('vehicle.save',{registration:'MH01AB1234'}),providerId='12345678-1234-1234-1234-123456789012',timestamp=Math.floor(Date.now()/1000)-120;
  const payload:Row={success:true,data:{values:[{vehicleId:providerId,vehicleNumber:'MH-01-AB-1234',gps:{currentLocationCoordinates:{lat:{value:19.1,timestamp},long:{value:72.8,timestamp}},speed:{value:35,unit:'km/h',timestamp:timestamp+10}}}],pagination:{page:1,perPage:50,more:false}}};let requests=0,bad=false;
  const fakeFetch=(async(url:string,options:RequestInit)=>{requests++;assert.ok(url.startsWith('https://api.a.loconav.com/'));assert.equal(new Headers(options.headers).get('User-Authentication'),'synthetic-gps-token');assert.deepEqual(JSON.parse(options.body as string).vehicleIds,[providerId]);assert.equal(options.redirect,'error');return new Response(JSON.stringify(bad?{success:true,data:{values:[{...payload.data.values[0],vehicleNumber:'WRONG123'}],pagination:{more:false}}}:payload),{headers:{'Content-Type':'application/json'}});}) as typeof fetch;
  const gps=new GpsService(svc,key,fakeFetch),conn=await gps.command('gps.connection.save',{provider:'loconav',label:'Synthetic authorized GPS',authorizationReference:'Local test only',token:'synthetic-gps-token',authorized:true});let state=await gps.state(),version=state.connections[0].version;assert.equal(state.connections[0].status,'ready');assert.equal(JSON.stringify(state).includes('synthetic-gps-token'),false);
  await gps.command('gps.mapping.add',{connectionId:conn.id,version,authorized:true,vehicleId:vehicle.id,providerVehicleId:providerId});state=await gps.state();version=state.connections[0].version;
  const sealed=sqlite.prepare('SELECT encrypted_token FROM gps_connections WHERE id=?').get(conn.id)!.encrypted_token as string;assert.ok(!sealed.includes('synthetic-gps-token'));assert.equal(await openGpsToken(sealed,key,org+':'+conn.id),'synthetic-gps-token');await assert.rejects(()=>openGpsToken(sealed,key,'other-scope'),/could not be opened/);assert.notEqual(await sealGpsToken('synthetic-gps-token',key,org+':'+conn.id),sealed);
  await assert.rejects(()=>new GpsService(other,key,fakeFetch).command('gps.sync',{connectionId:conn.id,version}),/not found/);
  const first=await gps.command('gps.sync',{connectionId:conn.id,version});assert.equal(first.added,1);state=await gps.state();assert.equal(state.connections[0].status,'connected');assert.equal(state.positions[0].latitude,19.1);assert.notEqual(state.positions[0].observed_at,state.positions[0].speed_observed_at);assert.equal(requests,1);
  await assert.rejects(()=>gps.command('gps.sync',{connectionId:conn.id,version:state.connections[0].version}),/less than a minute/);assert.equal(requests,1);
  sqlite.prepare('UPDATE gps_connections SET last_attempt_at=NULL').run();payload.data.values[0].gps.speed.value=36;const duplicate=await gps.command('gps.sync',{connectionId:conn.id,version:state.connections[0].version});assert.equal(duplicate.duplicates,1,'separately updated speed does not rewrite the original fix');assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM gps_observations').get()!.n,1);
  state=await gps.state();sqlite.prepare('UPDATE gps_connections SET last_attempt_at=NULL').run();bad=true;await assert.rejects(()=>gps.command('gps.sync',{connectionId:conn.id,version:state.connections[0].version}),/does not match/);state=await gps.state();assert.equal(state.connections[0].status,'error');assert.ok(state.connections[0].last_success_at);assert.equal(state.positions.length,1,'failed updates preserve prior fixes');assert.ok(!JSON.stringify(await svc.backup()).includes(sealed));assert.ok(!JSON.stringify(await svc.backup()).includes('synthetic-gps-token'));
  await gps.command('gps.connection.disable',{connectionId:conn.id,version:state.connections[0].version});assert.equal(sqlite.prepare('SELECT encrypted_token FROM gps_connections WHERE id=?').get(conn.id)!.encrypted_token,null);
  const wheel=await gps.command('gps.connection.save',{provider:'wheelseye',label:'WheelsEye onboarding',authorizationReference:'Awaiting approved API'});await assert.rejects(()=>gps.command('gps.sync',{connectionId:wheel.id,version:1}),/awaiting/);assert.equal(requests,3,'unconfigured WheelsEye never calls an invented endpoint');
  const mappings=[{provider_vehicle_id:providerId,registration:'MH01AB1234'}];assert.throws(()=>normalizeLocoNav({...payload,data:{...payload.data,values:[{...payload.data.values[0],vehicleId:'foreign-id'}]}},mappings),/unmapped/);
  await assert.rejects(()=>pullLocoNav('synthetic',mappings,(async()=>new Response('denied',{status:401})) as typeof fetch),/rejected/);await assert.rejects(()=>pullLocoNav('synthetic',mappings,(async()=>new Response('<html>',{headers:{'Content-Type':'text/html'}})) as typeof fetch),/unsupported/);sqlite.close();
});

test('disconnecting an in-flight GPS request prevents late position writes',async()=>{
  const {db,sqlite}=database(),svc=new TransportService(db,{userId:'gps-revoke',email:'revoke@example.com'});await svc.command('workspace.create',{name:'GPS revoke'});const vehicle=await svc.command('vehicle.save',{registration:'MH01AB1234'}),providerId='12345678-1234-1234-1234-123456789012';
  let reached!:()=>void,release!:()=>void;const started=new Promise<void>(r=>{reached=r;}),gate=new Promise<void>(r=>{release=r;}),timestamp=Math.floor(Date.now()/1000)-60;
  const gps=new GpsService(svc,btoa('b'.repeat(32)),(async()=>{reached();await gate;return new Response(JSON.stringify({success:true,data:{values:[{vehicleId:providerId,vehicleNumber:'MH01AB1234',gps:{currentLocationCoordinates:{lat:{value:19,timestamp},long:{value:72,timestamp}}}}],pagination:{more:false}}}),{headers:{'Content-Type':'application/json'}});}) as typeof fetch);
  const conn=await gps.command('gps.connection.save',{provider:'loconav',label:'Local revoke fixture',authorizationReference:'Synthetic only',token:'synthetic-revoke-token',authorized:true});await gps.command('gps.mapping.add',{connectionId:conn.id,version:1,vehicleId:vehicle.id,providerVehicleId:providerId,authorized:true});const pending=gps.command('gps.sync',{connectionId:conn.id,version:2});await started;await gps.command('gps.connection.disable',{connectionId:conn.id,version:2});release();await assert.rejects(()=>pending,/changed during/);const state=await gps.state();assert.equal(state.connections[0].status,'disabled');assert.equal(state.positions.length,0);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM gps_observations').get()!.n,0);sqlite.close();
});

test('hired trips preserve partial delivery, reviewed POD, exceptions, corrections and financial separation',async()=>{
  const {db,sqlite}=database(),svc=new TransportService(db,{userId:'trip-owner',email:'trips@example.com'}),other=new TransportService(db,{userId:'trip-other',email:'other@example.com'});
  await svc.command('workspace.create',{name:'Trips'});await other.command('workspace.create',{name:'Other'});
  const org=(await svc.member()).org_id;sqlite.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').run('trip-clerk',org,'clerk@example.com','MEMBER','2026-10-25');const clerk=new TransportService(db,{userId:'trip-clerk',email:'clerk@example.com'});
  const supplier=await svc.command('account.save',{kind:'supplier',code:'TRUCKS',name:'Hired Carrier'});for(const n of ['TRIP-A','TRIP-B','TRIP-C'])await svc.command('consignment.save',cn(n));
  const consignments=(await svc.state(year)).consignments,ids=consignments.filter((c:Row)=>c.cn!=='TRIP-C').map((c:Row)=>c.id),unallocated=consignments.find((c:Row)=>c.cn==='TRIP-C');
  const originalProfit=(await svc.financeReport(year)).report.netProfit,create={year,number:'T-001',registration:'MH01AB1234',supplierId:supplier.id,ids,requestId:'trip-create-request-1'},created=await clerk.command('trip.create',create),ts=new TripService(svc);
  assert.equal((await svc.command('trip.create',create)).alreadyRecorded,true);await assert.rejects(()=>svc.command('trip.create',{...create,number:'Changed'}),/different trip/);
  await assert.rejects(()=>svc.command('trip.create',{...create,number:'DUP',requestId:'trip-duplicate-allocation'}),/UNIQUE/);assert.equal((await ts.state()).trips.length,1,'allocation failure rolls back the entire trip');
  await assert.rejects(()=>svc.command('consignment.save',{...cn(consignments.find((c:Row)=>c.id===ids[0]).cn),id:ids[0],truck:'OTHER-TRUCK'}),/allocated to a trip/);await assert.rejects(()=>svc.command('consignment.delete',{id:ids[0]}),/trip history/);
  await assert.rejects(()=>new TripService(other).detail(created.id),/not found/);await assert.rejects(()=>other.command('trip.create',{...create,requestId:'other-create-trip'}),/not found/);
  let state=await ts.detail(created.id),counter=0;
  const event=async(kind:string,extra:Row={},actor=svc)=>{const current=await ts.detail(created.id);return actor.command('trip.event',{tripId:created.id,version:current.trip.version,kind,eventAt:'2026-10-24T12:00:00+05:30',requestId:'trip-event-'+(++counter),...extra});};
  await assert.rejects(()=>event('delivery',{allocationId:state.items[0].id,reference:'Receiver'}),/departure/);
  await assert.rejects(()=>event('dispatch',{eventAt:'2026-10-23T12:00:00+05:30'}),/consignment date/);await event('dispatch',{},clerk);
  const second=await svc.command('trip.create',{...create,number:'T-002',ids:[unallocated.id],requestId:'trip-create-request-2'});await assert.rejects(()=>svc.command('trip.event',{tripId:second.id,version:1,kind:'dispatch',eventAt:'2026-10-24T13:00:00+05:30',requestId:'second-trip-dispatch'}),/already dispatched/);
  state=await ts.detail(created.id);await assert.rejects(()=>event('cancel',{note:'Wrong trip'}),/Only a planned/);await assert.rejects(()=>event('close'),/every consignment/);
  await event('delivery',{allocationId:state.items[0].id,reference:'Receiver A'},clerk);state=await ts.detail(created.id);assert.equal(state.delivered,1);assert.equal(state.accepted,0);assert.equal(state.readyToClose,false);
  await assert.rejects(()=>event('pod_accept',{allocationId:state.items[0].id,reference:'POD-A'},clerk),/workspace owner/);
  await event('pod_reject',{allocationId:state.items[0].id,note:'Receiver stamp missing'});await event('pod_accept',{allocationId:state.items[0].id,reference:'Corrected POD-A'});assert.equal((await ts.state()).ready.length,1);
  await event('delivery',{allocationId:state.items[1].id,reference:'Receiver B'});await event('pod_accept',{allocationId:state.items[1].id,reference:'POD-B'});
  const issue=await event('exception',{note:'Damage query awaiting confirmation'},clerk);await assert.rejects(()=>event('close'),/resolve open exceptions/);await event('exception_resolve',{targetEventId:issue.id,note:'Customer confirmed no damage'},clerk);
  await assert.rejects(()=>event('correction',{targetEventId:issue.id,note:'Old correction'}),/latest active event/);
  const stale=(await ts.detail(created.id)).trip.version;await event('close');state=await ts.detail(created.id);assert.equal(state.trip.status,'closed');assert.equal(state.readyToClose,true);
  await assert.rejects(()=>svc.command('trip.event',{tripId:created.id,version:stale,kind:'exception',note:'Stale',eventAt:'2026-10-24T12:00:00+05:30',requestId:'stale-trip-version'}),/changed/);
  await event('correction',{targetEventId:state.active.at(-1).id,note:'Reopened for document verification'});state=await ts.detail(created.id);assert.equal(state.trip.status,'dispatched');assert.equal(state.events.filter((e:Row)=>e.kind==='close').length,1);assert.equal(state.corrected.length,1);await event('close');
  const cancel={tripId:second.id,version:1,kind:'cancel',note:'Incorrect planned allocation',eventAt:'2026-10-24T12:00:00+05:30',requestId:'trip-cancel-second'};await svc.command('trip.event',cancel);assert.equal((await svc.command('trip.event',cancel)).alreadyRecorded,true);assert.equal((await ts.state()).eligible.length,1);
  assert.equal((await svc.financeReport(year)).report.netProfit,originalProfit,'operational evidence creates no revenue, cost, receipt or settlement');assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM finance_entries').get()!.n,0);
  const backup=await svc.backup();assert.equal(backup.records.trips.length,2);assert.equal(backup.records.trip_allocations.length,3);assert.ok(backup.records.trip_events.length>10);
  sqlite.close();
});

test('trip boundaries enforce scoped references, immutable history and actual timestamps',async()=>{
  const {db,sqlite}=database(),svc=new TransportService(db,{userId:'trip-scope',email:'scope@example.com'});await svc.command('workspace.create',{name:'Scope'});await svc.command('consignment.save',cn());
  const supplier=await svc.command('account.save',{kind:'supplier',code:'SCOPE',name:'Carrier'}),c=(await svc.state(year)).consignments[0],trip=await svc.command('trip.create',{year,number:'SCOPE-1',registration:c.truck,supplierId:supplier.id,ids:[c.id],requestId:'scope-trip-create'}),state=await new TripService(svc).detail(trip.id);
  await assert.rejects(()=>svc.command('trip.event',{tripId:trip.id,version:1,kind:'dispatch',allocationId:state.items[0].id,eventAt:'2026-10-24T12:00:00+05:30',requestId:'scope-invalid-dispatch'}),/whole trip/);
  assert.throws(()=>actualTime(new Date(Date.now()+86400000).toISOString()),/future/);assert.throws(()=>actualTime('2026-02-30T12:00:00+05:30'),/valid/);assert.throws(()=>actualTime('2026-10-24T12:00'),/timezone/);
  const event={tripId:trip.id,version:1,kind:'dispatch',eventAt:'2026-10-24T12:00:00+05:30',requestId:'scope-dispatch-once'};await svc.command('trip.event',event);assert.equal((await svc.command('trip.event',event)).alreadyRecorded,true);await assert.rejects(()=>svc.command('trip.event',{...event,eventAt:'2026-10-24T13:00:00+05:30'}),/different event/);
  assert.throws(()=>sqlite.prepare("UPDATE trip_events SET note='rewrite'").run(),/immutable/);assert.throws(()=>sqlite.prepare("UPDATE trip_allocations SET snapshot='{}'").run(),/immutable/);assert.throws(()=>sqlite.prepare("UPDATE trips SET vehicle_snapshot='FAKE'").run(),/immutable/);
  sqlite.close();
});

test('all-years customer accounts preserve issued documents, exact aliases, due-term history and financial separation',async()=>{
  const {db,sqlite}=database(),svc=new TransportService(db,{userId:'accounts-owner',email:'accounts@example.com'}),other=new TransportService(db,{userId:'accounts-other',email:'other@example.com'});await svc.command('workspace.create',{name:'Accounts Transport'});await other.command('workspace.create',{name:'Other'});const accounts=new AccountsService(svc);
  await svc.command('consignment.save',{...cn('PAST-YEAR'),year:'2025-2026',date:'2026-03-20',freight:1000,advance:0});const oldTrip=(await svc.state('2025-2026')).consignments[0],old=await svc.command('invoice.create',{year:'2025-2026',date:'2026-03-20',ids:[oldTrip.id],taxMode:'none'});await svc.command('receipt.create',{invoiceId:old.id,date:'2026-04-01',amount:300,method:'bank',requestId:'accounts-old-receipt'});
  await svc.command('consignment.save',{...cn('CURRENT-YEAR'),company:'Acme Branch',freight:2000,advance:0});const trip=(await svc.state(year)).consignments[0],current=await svc.command('invoice.create',{year,date:'2026-10-24',ids:[trip.id],taxMode:'none'});await svc.command('receipt.create',{invoiceId:current.id,date:'2026-10-24',amount:400,method:'bank',requestId:'accounts-new-receipt'});
  let state=await accounts.state('customer');assert.equal(state.groups.length,2);assert.equal(state.totals.remaining,230000);const before=sqlite.prepare('SELECT snapshot,revision,total,company FROM invoices WHERE id=?').get(old.id),pnl=(await svc.financeReport(year)).report.netProfit;
  const party=await svc.command('account.save',{kind:'customer',code:'c-001',name:'Acme customer account'});await svc.command('account.alias.link',{partyId:party.id,alias:'Acme Logistics'});await svc.command('account.alias.link',{partyId:party.id,alias:'Acme Branch'});await svc.command('account.alias.link',{partyId:party.id,alias:'Acme Logistics'});state=await accounts.state('customer');assert.equal(state.groups.length,1);assert.equal(state.groups[0].count,2);assert.equal(state.groups[0].undated,230000);assert.equal(state.groups[0].paid,70000);assert.deepEqual(sqlite.prepare('SELECT snapshot,revision,total,company FROM invoices WHERE id=?').get(old.id),before);assert.equal((await svc.financeReport(year)).report.netProfit,pnl);
  await svc.command('account.terms.save',{invoiceId:old.id,dueDate:'2026-04-01',note:'Agreed collection reference',version:1});await svc.command('account.terms.save',{invoiceId:current.id,dueDate:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),note:'Due on invoice',version:1});state=await accounts.state('customer');assert.equal(state.groups[0].daysMore,70000);assert.equal(state.groups[0].notDue,160000);await assert.rejects(()=>svc.command('account.terms.save',{invoiceId:current.id,dueDate:'2026-10-23',note:'Invalid',version:2}),/before/);await svc.command('account.terms.save',{invoiceId:current.id,dueDate:'',note:'Agreement under review',version:2});await assert.rejects(()=>svc.command('account.terms.save',{invoiceId:current.id,dueDate:'2026-10-25',note:'Stale edit',version:2}),/changed/);assert.equal((await svc.receiptHistory(current.id)).termsHistory.length,2);assert.equal((await accounts.state('customer')).groups[0].undated,160000);
  const statement=await accounts.statement('customer',`party:${party.id}`);assert.equal(statement.documents.length,2);assert.equal(statement.payments.length,2);assert.equal(statement.payments.reduce((n:number,r:Row)=>n+r.amount,0),70000);await svc.command('account.save',{id:party.id,version:1,kind:'customer',code:'C-001',name:'Renamed account display'});assert.equal((await accounts.state('customer')).groups[0].name,'Renamed account display');assert.deepEqual(sqlite.prepare('SELECT snapshot,revision,total,company FROM invoices WHERE id=?').get(old.id),before);
  const wrong=await svc.command('account.save',{kind:'customer',code:'C-002',name:'Separate account'});await assert.rejects(()=>svc.command('account.alias.link',{partyId:wrong.id,alias:'Acme Branch'}),/another|different/);await assert.rejects(()=>other.command('account.alias.link',{partyId:party.id,alias:'Acme Branch'}),/not found/);assert.equal((await new AccountsService(other).state('customer')).documents.length,0);await assert.rejects(()=>new AccountsService(other).statement('customer',`party:${party.id}`),/not found/);
  await svc.command('consignment.save',{...cn('FUTURE-ALIAS'),company:'Acme Branch',freight:500,advance:0});const nextTrip=(await svc.state(year)).consignments.find((r:Row)=>r.cn==='FUTURE-ALIAS'),next=await svc.command('invoice.create',{year,date:'2026-10-24',ids:[nextTrip.id],taxMode:'none'});assert.equal(sqlite.prepare('SELECT customer_party_id FROM invoices WHERE id=?').get(next.id)!.customer_party_id,party.id);await svc.command('account.terms.save',{invoiceId:next.id,dueDate:'2026-11-01',note:'Future collection',version:1});await assert.rejects(()=>svc.command('invoice.delete',{id:next.id}),/terms history/);assert.throws(()=>sqlite.prepare("UPDATE invoices SET date='2026-11-02' WHERE id=?").run(next.id),/due terms/);
  await svc.command('team.invite',{email:'accounts-member@example.com'});const member=new TransportService(db,{userId:'accounts-member',email:'accounts-member@example.com'});await member.command('invitation.accept',{id:(await member.state(year)).pending[0].id});await assert.rejects(()=>new AccountsService(member).state('customer'),/owner/);await assert.rejects(()=>member.command('account.terms.save',{invoiceId:current.id,dueDate:'',note:'Not owner',version:3}),/owner/);assert.equal((await svc.backup()).records.parties.length,2);assert.equal((await svc.backup()).records.invoice_terms_history.length,4);sqlite.close();
});

test('all-years supplier accounts include uninitialized opening totals and future exact-name assignments without rewriting payment history',async()=>{
  const {db,sqlite}=database(),svc=new TransportService(db,{userId:'supplier-accounts',email:'suppliers@example.com'});await svc.command('workspace.create',{name:'Supplier accounts'});const accounts=new AccountsService(svc);
  await svc.command('consignment.save',{...cn('OLD-CARRIER'),year:'2025-2026',date:'2026-03-20'});const old=(await svc.state('2025-2026')).consignments[0];await svc.command('payments.save',{id:old.id,provider:'Hired Carrier',truckFreight:800,advancePaid:300});await svc.command('consignment.save',cn('NEW-CARRIER'));const current=(await svc.state(year)).consignments[0],history=await new SupplierService(svc).history(current.id);await svc.command('supplier.cost.save',{id:current.id,provider:'Hired Carrier Branch',truckFreight:1000,version:history.consignment.provider_version});await svc.command('supplier.payment.create',{consignmentId:current.id,date:'2026-10-24',kind:'payment',amount:400,method:'bank',reference:'Carrier payment',requestId:'account-carrier-payment'});
  const party=await svc.command('account.save',{kind:'supplier',code:'S-001',name:'Carrier account'});await svc.command('account.alias.link',{partyId:party.id,alias:'Hired Carrier'});await svc.command('account.alias.link',{partyId:party.id,alias:'Hired Carrier Branch'});const state=await accounts.state('supplier');assert.equal(state.groups.length,1);assert.equal(state.groups[0].remaining,110000);assert.equal(state.groups[0].paid,70000);const statement=await accounts.statement('supplier',`party:${party.id}`);assert.equal(statement.payments.length,2);assert.equal(statement.payments.find((p:Row)=>p.document_id===old.id).date,null);assert.equal(sqlite.prepare('SELECT settlement_initialized FROM consignments WHERE id=?').get(old.id)!.settlement_initialized,0,'read-only statements do not rewrite opening totals');assert.equal(statement.payments.reduce((n:number,p:Row)=>n+p.amount,0),state.groups[0].paid);
  await svc.command('consignment.save',cn('FUTURE-CARRIER'));const next=(await svc.state(year)).consignments.find((r:Row)=>r.cn==='FUTURE-CARRIER');await svc.command('payments.save',{id:next.id,provider:'Hired Carrier',truckFreight:200});assert.equal(sqlite.prepare('SELECT supplier_party_id FROM consignments WHERE id=?').get(next.id)!.supplier_party_id,party.id);const org=(await svc.member()).org_id;assert.throws(()=>sqlite.prepare('INSERT INTO party_aliases VALUES(?,?,?,?,?,?)').run('bad-alias',org,party.id,'customer','Wrong role','2026-10-25'),/same company and type/);sqlite.close();
});

test('ageing boundaries keep undated balances and excess payments distinct without netting documents',()=>{
  const today='2026-10-25',days=[0,1,30,31,60,61,90,91,null],rows:Row[]=days.map((n,i)=>({id:String(i),party_id:'stable-party',party_name:'Account',label:'Original name',cost:100,paid:0,due_date:n===null?null:new Date(Date.parse(today)-n*86400000).toISOString().slice(0,10)}));rows.push({id:'excess',party_id:'stable-party',party_name:'Account',label:'Original name',cost:100,paid:150,due_date:today});const g=balanceReport(rows,today).groups[0];assert.deepEqual([g.notDue,g.days30,g.days60,g.days90,g.daysMore,g.undated],[100,200,200,200,100,100]);assert.equal(g.remaining,900);assert.equal(g.excess,50);
});

test('supplier settlement preserves opening totals, partial history and cost recognition with tenant and concurrency protection',async()=>{
  const {db,sqlite}=database(),svc=new TransportService(db,{userId:'supplier-owner',email:'supplier@example.com'}),other=new TransportService(db,{userId:'supplier-other',email:'other@example.com'});await svc.command('workspace.create',{name:'Supplier Transport'});await other.command('workspace.create',{name:'Other'});await svc.command('consignment.save',cn('SUPPLIER-1'));const trip=(await svc.state(year)).consignments[0],supplier=new SupplierService(svc);
  await svc.command('payments.save',{id:trip.id,provider:'Hired Carrier',truckFreight:7000,otherCharges:200,advancePaid:1000,balancePaid:200,balanceDate:'2026-10-24'});let state=await supplier.history(trip.id);assert.equal(state.payments.length,2);assert.equal(state.paid,120000);assert.equal(state.remaining,600000);assert.equal(state.unknownDateCount,1);assert.equal(state.payments.find((p:Row)=>p.kind==='advance').date,null);await supplier.history(trip.id);assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM audit WHERE action='supplier.legacy-initialize'").get()!.n,1);
  const cost={id:trip.id,provider:'Hired Carrier',truckFreight:7000,otherCharges:200,dueDate:'2026-10-20',version:state.consignment.provider_version};await svc.command('supplier.cost.save',cost);state=await supplier.history(trip.id);const oldVersion=state.consignment.provider_version;
  const data={consignmentId:trip.id,date:'2026-10-24',kind:'payment',amount:3000,method:'bank',reference:'BANK-SUPPLIER-1',requestId:'supplier-payment-1'},payment=await svc.command('supplier.payment.create',data);assert.equal((await svc.command('supplier.payment.create',data)).alreadyRecorded,true);await assert.rejects(()=>svc.command('supplier.payment.create',{...data,amount:1}),/different/);
  state=await supplier.history(trip.id);assert.equal(state.paid,420000);assert.equal(state.remaining,300000);assert.equal((await svc.state(year)).consignments[0].provider_total_paid,420000);assert.equal((await svc.financeReport(year)).report.netProfit,280000,'settlement is not a second transport cost');assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM finance_entries').get()!.n,0);
  await assert.rejects(()=>svc.command('supplier.payment.create',{...data,requestId:'supplier-overpayment',amount:3001}),/remaining cost/);await assert.rejects(()=>svc.command('supplier.payment.create',{...data,requestId:'supplier-future-date',date:'2099-01-01'}),/future/);await assert.rejects(()=>svc.command('supplier.cost.save',{...cost,version:oldVersion}),/changed/);await assert.rejects(()=>svc.command('supplier.cost.save',{...cost,version:state.consignment.provider_version,truckFreight:1}),/Reconcile/);await assert.rejects(()=>svc.command('supplier.cost.save',{...cost,version:state.consignment.provider_version,provider:'Wrong carrier'}),/Reconcile/);await assert.rejects(()=>svc.command('payments.save',{id:trip.id,truckFreight:1}),/settlement history/);
  assert.throws(()=>sqlite.prepare('UPDATE supplier_payments SET amount=1 WHERE id=?').run(payment.id),/immutable/);await assert.rejects(()=>svc.command('consignment.delete',{id:trip.id}),/supplier payment history/);await assert.rejects(()=>new SupplierService(other).history(trip.id),/not found/);await assert.rejects(()=>other.command('supplier.payment.void',{id:payment.id,reason:'Wrong tenant'}),/not found/);
  await svc.command('team.invite',{email:'supplier-member@example.com'});const member=new TransportService(db,{userId:'supplier-member',email:'supplier-member@example.com'});await member.command('invitation.accept',{id:(await member.state(year)).pending[0].id});assert.equal((await new SupplierService(member).history(trip.id)).paid,420000);await assert.rejects(()=>member.command('supplier.payment.create',data),/owner/);
  await assert.rejects(()=>svc.command('supplier.payment.void',{id:payment.id}),/Void reason/);await svc.command('supplier.payment.void',{id:payment.id,reason:'Correct synthetic duplicate'});state=await supplier.history(trip.id);assert.equal(state.remaining,600000);const opening=state.payments.find((p:Row)=>p.kind==='advance');await svc.command('supplier.payment.void',{id:opening.id,reason:'Opening advance entered incorrectly'});state=await supplier.history(trip.id);assert.equal(state.paid,20000);assert.equal(state.payments.length,3);assert.equal(state.unknownDateCount,0);assert.equal((await svc.state(year)).consignments[0].provider_total_paid,20000);assert.equal((await svc.backup()).records.supplier_payments.length,3);assert.equal((await svc.backup()).records.consignments[0].advance_paid,100000,'original opening totals remain preserved');assert.equal((await svc.financeReport(year)).report.netProfit,280000);sqlite.close();
});

test('supplier schema-only upgrade retains excess opening payments and unknown dates without inventing settlement from a paid flag',async()=>{
  const {db,sqlite}=database('0011');sqlite.prepare("INSERT INTO organizations(id,owner_id,name,created_at) VALUES('supplier-legacy-org','supplier-legacy-owner','Legacy carrier','2026-10-24')").run();sqlite.prepare("INSERT INTO memberships VALUES('supplier-legacy-owner','supplier-legacy-org','legacy@example.com','OWNER','2026-10-24')").run();
  const svc=new TransportService(db,{userId:'supplier-legacy-owner',email:'legacy@example.com'});const first=svc.consignment(cn('LEGACY-EXCESS'),'supplier-legacy-org',year),flag=svc.consignment(cn('LEGACY-FLAG'),'supplier-legacy-org',year);await db.batch([svc.insert('consignments',{...first,truck_freight:10000,advance_paid:15000,advance_date:'invalid original date',payment_done:0}),svc.insert('consignments',{...flag,truck_freight:10000,payment_done:1})]);
  const negative=svc.consignment(cn('LEGACY-NEGATIVE'),'supplier-legacy-org',year);await db.batch([svc.insert('consignments',{...negative,advance_paid:-100})]);
  sqlite.exec(readFileSync('drizzle/0011_third_toad.sql','utf8'));assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM supplier_payments').get()!.n,0,'deployment migration contains no data backfill');const supplier=new SupplierService(svc),history=await supplier.history(first.id);assert.equal(history.overpaid,5000);assert.equal(history.payments[0].date,null);assert.ok(history.payments[0].reference.includes('invalid original date'));assert.equal((await supplier.history(flag.id)).paid,0,'a paid flag alone must not fabricate cash amounts');await assert.rejects(()=>svc.command('supplier.payment.create',{consignmentId:first.id,date:'2026-10-24',kind:'payment',amount:1,method:'cash',reference:'Not permitted',requestId:'legacy-excess-reject'}),/remaining cost/);for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')&&f>'0011_third_toad.sql').sort())sqlite.exec(readFileSync(`drizzle/${file}`,'utf8'));assert.equal((await svc.state(year)).consignments.find((r:Row)=>r.id===first.id).provider_total_paid,15000);await assert.rejects(()=>supplier.history(negative.id),/negative adjustment/);assert.equal(sqlite.prepare('SELECT settlement_initialized FROM consignments WHERE id=?').get(negative.id)!.settlement_initialized,0,'unsupported legacy corrections stay untouched');sqlite.close();
});

test('monthly payroll records gross staff cost once, recovers advances and records net payments without moving money',async()=>{
  const {db,sqlite}=database(),svc=new TransportService(db,{userId:'payroll-owner',email:'payroll@example.com'}),other=new TransportService(db,{userId:'payroll-other',email:'other@example.com'});await svc.command('workspace.create',{name:'Payroll Transport'});await other.command('workspace.create',{name:'Other'});const payroll=new PayrollService(svc);
  const employee=await svc.command('staff.employee.save',{code:'P-1',name:'Synthetic employee',joinedOn:'2026-04-01'});await svc.command('staff.salary.add',{employeeId:employee.id,effectiveFrom:'2026-04-01',monthlyAmount:30000});
  const advance=await svc.command('staff.advance.create',{employeeId:employee.id,date:'2026-09-10',kind:'advance',amount:5000,method:'bank',reference:'ADV-1',requestId:'payroll-advance-1'});assert.equal((await svc.command('staff.advance.create',{employeeId:employee.id,date:'2026-09-10',kind:'advance',amount:5000,method:'bank',reference:'ADV-1',requestId:'payroll-advance-1'})).alreadyRecorded,true);
  await svc.command('staff.advance.create',{employeeId:employee.id,date:'2026-09-20',kind:'repayment',amount:1000,method:'cash',reference:'CASH-1',requestId:'payroll-repayment-1'});
  await assert.rejects(()=>svc.command('staff.advance.create',{employeeId:employee.id,date:'2026-09-01',kind:'repayment',amount:1,method:'cash',requestId:'backdated-repayment'}),/balance/);
  const run=await svc.command('staff.payrun.create',{period:'2026-09'});await assert.rejects(()=>svc.command('staff.payrun.create',{period:'2026-09'}),/UNIQUE/);let state=await payroll.state('2026-09');const line=state.lines[0];assert.equal(line.gross,3000000);assert.equal(state.employees[0].balance,400000);
  await assert.rejects(()=>svc.command('staff.payrun.post',{id:run.id,version:1}),/Review every/);
  await svc.command('staff.payrun.line.save',{id:line.id,version:1,gross:30000,deductions:3000,employerCost:2000,advanceRecovery:5000,reviewed:true});
  await assert.rejects(()=>svc.command('staff.payrun.post',{id:run.id,version:2}),/recovery exceeds/i);assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM finance_entries WHERE source='payroll'").get()!.n,0);assert.equal((await payroll.state('2026-09')).run.status,'draft');
  await svc.command('staff.payrun.line.save',{id:line.id,version:2,gross:30000,deductions:3000,employerCost:2000,advanceRecovery:2000,reviewed:true});await svc.command('staff.payrun.post',{id:run.id,version:3});assert.equal((await svc.command('staff.payrun.post',{id:run.id,version:3})).alreadyPosted,true);
  state=await payroll.state('2026-09');assert.equal(state.run.status,'posted');assert.equal(state.lines[0].net_pay,2500000);assert.equal(state.employees[0].balance,200000);assert.equal((await svc.financeReport(year)).report.overheads,3200000);assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM finance_entries WHERE source='payroll'").get()!.n,1);
  await assert.rejects(()=>svc.command('finance.void',{id:state.run.finance_entry_id,version:1}),/payroll/);await assert.rejects(()=>svc.command('staff.payrun.line.save',{id:line.id,version:4,gross:1}),/draft/);assert.throws(()=>sqlite.prepare('UPDATE staff_payrun_lines SET gross=1 WHERE id=?').run(line.id),/immutable/);
  const paymentData={lineId:line.id,date:'2026-10-01',amount:10000,method:'bank',reference:'SALARY-1',requestId:'salary-payment-1'},payment=await svc.command('staff.payment.create',paymentData);assert.equal((await svc.command('staff.payment.create',paymentData)).alreadyRecorded,true);assert.equal((await payroll.state('2026-09')).lines[0].paid_amount,1000000);assert.equal((await svc.financeReport(year)).report.overheads,3200000);
  await assert.rejects(()=>svc.command('staff.payment.create',{...paymentData,requestId:'salary-payment-2',amount:15001}),/remaining balance/);await assert.rejects(()=>svc.command('staff.payrun.void',{id:run.id,version:4,reason:'Correction'}),/Void recorded salary/);await assert.rejects(()=>other.command('staff.payment.void',{id:payment.id,reason:'Wrong tenant'}),/not found/);assert.equal((await new PayrollService(other).state('2026-09')).runs.length,0);
  const statement=await payroll.statement(line.id);assert.equal(statement.paid,1000000);assert.equal(statement.line.snapshot.employee.name,'Synthetic employee');await svc.command('staff.payment.void',{id:payment.id,reason:'Synthetic payment correction'});await svc.command('staff.payrun.void',{id:run.id,version:4,reason:'Recreate reviewed payroll'});assert.equal((await svc.financeReport(year)).report.overheads,0);assert.equal((await payroll.state('2026-09')).employees[0].balance,400000);await assert.rejects(()=>svc.command('staff.advance.void',{id:advance.id,reason:'Cannot erase repaid advance'}),/negative/);
  assert.equal((await svc.backup()).records.staff_salary_payments.length,1);assert.equal((await svc.backup()).records.staff_payruns.length,1);sqlite.close();
});

test('payroll review catches duplicate expense risk, preserves voided history and rejects cross-period advance funding',async()=>{
  const {db,sqlite}=database(),svc=new TransportService(db,{userId:'payroll-review',email:'review@example.com'});await svc.command('workspace.create',{name:'Review Transport'});const payroll=new PayrollService(svc),employee=await svc.command('staff.employee.save',{code:'R-1',name:'Review fixture',joinedOn:'2026-04-15'});
  await assert.rejects(()=>svc.command('staff.payrun.create',{period:'2026-09'}),/applicable salary/);assert.equal((await payroll.state('2026-09')).runs.length,0);
  await svc.command('staff.salary.add',{employeeId:employee.id,effectiveFrom:'2026-04-01',monthlyAmount:1000});await svc.command('staff.advance.create',{employeeId:employee.id,date:'2026-10-01',kind:'advance',amount:1000,method:'cash',requestId:'october-advance-only'});
  const voucher=await svc.command('finance.save',{year,date:'2026-09-15',category:'staff',amount:100,description:'Separate staff obligation'});await svc.command('finance.post',{id:voucher.id,version:1});const run=await svc.command('staff.payrun.create',{period:'2026-09'});let state=await payroll.state('2026-09'),line=state.lines[0];await svc.command('staff.payrun.line.save',{id:line.id,version:1,gross:1000,advanceRecovery:1,reviewed:true});
  await assert.rejects(()=>svc.command('staff.payrun.post',{id:run.id,version:2}),/existing staff expense/);await assert.rejects(()=>svc.command('staff.payrun.post',{id:run.id,version:2,existingCostsReviewed:true}),/recovery exceeds/i);assert.equal((await svc.financeReport(year)).report.overheads,10000,'failed payroll must not leave an expense');
  await svc.command('staff.payrun.line.save',{id:line.id,version:2,gross:0,reviewed:true});await assert.rejects(()=>svc.command('staff.payrun.line.save',{id:line.id,version:2,gross:1000,reviewed:true}),/changed/);await svc.command('staff.payrun.post',{id:run.id,version:3,existingCostsReviewed:true});assert.equal((await payroll.state('2026-09')).lines[0].net_pay,0);assert.equal((await svc.financeReport(year)).report.overheads,10000);
  await svc.command('staff.payrun.void',{id:run.id,version:4,reason:'Recreate unpaid-leave fixture'});const historical=await payroll.state('2026-09',run.id);assert.equal(historical.run.status,'void');assert.equal(historical.lines.length,1);const next=await svc.command('staff.payrun.create',{period:'2026-09'});assert.notEqual(next.id,run.id);
  const future=await svc.command('staff.payrun.create',{period:'2099-01'});state=await payroll.state('2099-01');line=state.lines[0];await svc.command('staff.payrun.line.save',{id:line.id,version:1,gross:1000,reviewed:true});await assert.rejects(()=>svc.command('staff.payrun.post',{id:future.id,version:2}),/completed payroll/);sqlite.close();
});

test('staff directory and effective-dated salary terms preserve history, privacy and financial separation',async()=>{
  const {db,sqlite}=database(),svc=new TransportService(db,{userId:'staff-owner',email:'staff@example.com'}),other=new TransportService(db,{userId:'staff-other',email:'other@example.com'});await svc.command('workspace.create',{name:'Staff Transport'});await other.command('workspace.create',{name:'Other'});
  const staff=new StaffService(svc),outsider=new StaffService(other),employee={code:'emp-001',name:'Synthetic dispatcher',designation:'Dispatcher',branch:'Office A',joinedOn:'2026-04-01'};
  const created=await svc.command('staff.employee.save',employee);assert.equal((await staff.state('2026-10-25')).missingSalaryCount,1);
  const first=await svc.command('staff.salary.add',{employeeId:created.id,effectiveFrom:'2026-04-01',monthlyAmount:'25000',note:'Initial terms'});await svc.command('staff.salary.add',{employeeId:created.id,effectiveFrom:'2026-11-01',monthlyAmount:'28000',note:'Future revision'});
  assert.equal((await staff.state('2026-10-25')).monthlyReference,2500000);assert.equal((await staff.state('2026-11-01')).monthlyReference,2800000);assert.equal((await staff.state('2026-03-31')).activeCount,0);assert.equal((await svc.financeReport(year)).report.overheads,0,'Reference salary does not become an expense');
  await assert.rejects(()=>other.command('staff.salary.add',{employeeId:created.id,effectiveFrom:'2026-10-01',monthlyAmount:1}),/not found/);assert.equal((await outsider.state('2026-10-25')).employees.length,0);
  await assert.rejects(()=>svc.command('staff.employee.save',employee),/UNIQUE/);await assert.rejects(()=>svc.command('staff.salary.add',{employeeId:created.id,effectiveFrom:'2026-04-01',monthlyAmount:1}),/UNIQUE/);await assert.rejects(()=>svc.command('staff.salary.add',{employeeId:created.id,effectiveFrom:'2026-10-15',monthlyAmount:1}),/first day/);await assert.rejects(()=>svc.command('staff.salary.add',{employeeId:created.id,effectiveFrom:'2026-10-01',monthlyAmount:0}),/greater/);
  await svc.command('staff.employee.save',{...employee,id:created.id,version:1,leftOn:'2026-12-31'});await assert.rejects(()=>svc.command('staff.employee.save',{...employee,id:created.id,version:1}),/changed/);assert.equal((await staff.state('2027-01-01')).activeCount,0);await assert.rejects(()=>svc.command('staff.salary.add',{employeeId:created.id,effectiveFrom:'2027-01-01',monthlyAmount:1}),/after the employee/);
  await assert.rejects(()=>svc.command('staff.salary.void',{id:first.id}),/Correction reason/);await svc.command('staff.salary.void',{id:first.id,reason:'Correct synthetic initial salary'});assert.equal((await staff.state('2026-10-25')).missingSalaryCount,1);await svc.command('staff.salary.add',{employeeId:created.id,effectiveFrom:'2026-04-01',monthlyAmount:26000,note:'Corrected terms'});assert.equal((await staff.state('2026-10-25')).monthlyReference,2600000);assert.equal((await staff.state('2026-10-25')).terms.length,3);
  await svc.command('team.invite',{email:'staff-member@example.com'});const member=new TransportService(db,{userId:'staff-member',email:'staff-member@example.com'});await member.command('invitation.accept',{id:(await member.state(year)).pending[0].id});await assert.rejects(()=>new StaffService(member).state('2026-10-25'),/owner/);await assert.rejects(()=>member.command('staff.employee.save',{...employee,code:'NO'}),/owner/);
  const backup=await svc.backup();assert.equal(backup.records.staff_employees.length,1);assert.equal(backup.records.staff_salary_terms.length,3);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM password_accounts').get()!.n,0,'Staff records never grant login access');sqlite.close();
});

test('receipt schema upgrade stays schema-only and compatibility initialization preserves unknown settlement dates',async()=>{
  const {db,sqlite}=database('0006');
  sqlite.prepare("INSERT INTO organizations(id,owner_id,name,created_at) VALUES('legacy-org','legacy-owner','Legacy','2026-10-24')").run();
  sqlite.prepare("INSERT INTO invoices(id,org_id,year,number,date,company,total,paid,snapshot,created_at) VALUES('legacy-paid','legacy-org','2026-2027',1,'2026-10-24','Customer',12345,1,'{}','2026-10-24')").run();
  for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')&&f>='0006').sort())sqlite.exec(readFileSync(`drizzle/${file}`,'utf8'));
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM invoice_receipts').get()!.n,0);
  const service=new TransportService(db,{userId:'legacy-owner',email:'legacy@example.com'});await service.initializeLegacyReceipts('legacy-org');await service.initializeLegacyReceipts('legacy-org');
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM invoice_receipts').get()!.n,1);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM audit').get()!.n,1);
  const receipt=sqlite.prepare('SELECT * FROM invoice_receipts').get()!;assert.equal(receipt.amount,12345);assert.equal(receipt.date,null);assert.equal(receipt.source,'legacy_flag');assert.equal(sqlite.prepare('SELECT total,paid FROM invoices').get()!.paid,1);sqlite.close();
});

test('partial customer receipts reconcile outstanding amounts, preserve history and never create P&L income',async()=>{
  const {db,sqlite}=database(),svc=new TransportService(db,{userId:'receipt-owner',email:'receipts@example.com'}),other=new TransportService(db,{userId:'receipt-other',email:'other@example.com'});await svc.command('workspace.create',{name:'Receipts Transport'});await other.command('workspace.create',{name:'Other'});
  await svc.command('consignment.save',cn());const trip=(await svc.state(year)).consignments[0];const invoice=await svc.command('invoice.create',{year,date:'2026-10-24',ids:[trip.id],taxMode:'none'});
  const data={invoiceId:invoice.id,date:'2026-10-24',amount:3000,method:'bank',reference:'BANK-1',requestId:'receipt-request-1'};
  const receipt=await svc.command('receipt.create',data);assert.equal((await svc.command('receipt.create',data)).alreadyRecorded,true);await assert.rejects(()=>svc.command('receipt.create',{...data,amount:1}),/different details/);
  let value=await svc.receiptHistory(invoice.id);assert.equal(value.received,300000);assert.equal(value.balance,600000);assert.equal((await svc.state(year)).invoices[0].paid,0);assert.equal((await svc.state(year)).invoices[0].received_amount,300000);
  assert.equal((await svc.financeReport(year)).report.revenue,1000000);await assert.rejects(()=>other.receiptHistory(invoice.id),/not found/);await assert.rejects(()=>other.command('receipt.void',{id:receipt.id,reason:'Wrong tenant'}),/not found/);
  await assert.rejects(()=>svc.command('receipt.create',{...data,requestId:'receipt-request-2',amount:6001}),/exceeds/);await assert.rejects(()=>svc.command('invoice.paid',{id:invoice.id,paid:false}),/receipt history/);await assert.rejects(()=>svc.command('invoice.reissue',{year,id:invoice.id,date:'2026-10-24',ids:[trip.id]}),/Void recorded/);
  assert.throws(()=>sqlite.prepare('UPDATE invoices SET total=1 WHERE id=?').run(invoice.id),/Void recorded/);assert.throws(()=>sqlite.prepare('DELETE FROM invoices WHERE id=?').run(invoice.id),/receipt history/);
  await svc.command('receipt.create',{...data,requestId:'receipt-request-3',amount:6000});assert.equal((await svc.state(year)).invoices[0].paid,1);assert.equal((await svc.receiptHistory(invoice.id)).balance,0);
  await assert.rejects(()=>svc.command('receipt.void',{id:receipt.id}),/Reason/);await svc.command('receipt.void',{id:receipt.id,reason:'Synthetic receipt entered incorrectly'});value=await svc.receiptHistory(invoice.id);assert.equal(value.balance,300000);assert.equal(value.receipts.filter((r:Row)=>r.status==='void').length,1);assert.equal((await svc.state(year)).invoices[0].paid,0);await assert.rejects(()=>svc.command('invoice.delete',{id:invoice.id}),/history/);
  assert.equal((await svc.backup()).records.invoice_receipts.length,2);sqlite.close();
});

test('transport imports preserve provenance, reject conflicting replays and prepare toll expenses exactly once',async()=>{
  const {db,sqlite}=database(),svc=new TransportService(db,{userId:'integration-owner',email:'integration@example.com'}),other=new TransportService(db,{userId:'integration-other',email:'other@example.com'});
  await svc.command('workspace.create',{name:'Integration Transport'});await other.command('workspace.create',{name:'Other'});
  const toll={provider:'Example issuer',externalId:'TX-1',vehicle:'MH-01-AB-1234',observedAt:'2026-10-24T10:30:00+05:30',amount:'250.50',direction:'debit',plaza:'Example plaza'};
  const first=await svc.command('integration.import',{kind:'toll_transaction',sourceReference:'Authorized sample statement',rows:[toll,toll]});assert.equal(first.imported,1);assert.equal(first.duplicates,1);
  assert.equal((await svc.command('integration.import',{kind:'toll_transaction',sourceReference:'Same statement',rows:[toll]})).duplicates,1);
  await assert.rejects(()=>svc.command('integration.import',{kind:'toll_transaction',sourceReference:'Changed',rows:[{...toll,externalId:'TX-2'},{...toll,amount:300}]}),/different details/);
  let records=await svc.integrationState();assert.equal(records.records.length,1);assert.equal(records.records[0].provenance,'imported');assert.equal(records.records[0].payload.amount,25050);assert.deepEqual(records.liveConnections,[]);const event=records.records[0];
  await assert.rejects(()=>other.command('integration.prepare-expense',{year,id:event.id,costResponsibility:'company'}),/not found/);
  await assert.rejects(()=>svc.command('integration.prepare-expense',{year,id:event.id,costResponsibility:'provider'}),/Confirm/);
  await assert.rejects(()=>svc.command('integration.prepare-expense',{year:'2025-2026',id:event.id,costResponsibility:'company'}),/financial year/);
  const draft=await svc.command('integration.prepare-expense',{year,id:event.id,costResponsibility:'company'});assert.equal((await svc.financeReport(year)).report.directCosts,0);
  const again=await svc.command('integration.prepare-expense',{year,id:event.id,costResponsibility:'company'});assert.equal(again.id,draft.id);assert.equal(again.alreadyPrepared,true);
  await svc.command('finance.post',{id:draft.id,version:1});assert.equal((await svc.financeReport(year)).report.directCosts,25050);assert.equal((await svc.integrationState()).records[0].finance_status,'posted');
  await svc.command('integration.import',{kind:'toll_transaction',sourceReference:'Other transactions',rows:[{...toll,externalId:'TOPUP-1',direction:'topup'},{...toll,externalId:'REFUND-1',direction:'refund'}]});
  for(const r of (await svc.integrationState()).records.filter((r:Row)=>r.payload.direction!=='debit'))await assert.rejects(()=>svc.command('integration.prepare-expense',{year,id:r.id,costResponsibility:'company'}),/Only toll debits/);
  const position={provider:'Example GPS',externalId:'GPS-1',vehicle:'MH-01-AB-1234',observedAt:'2026-10-24T10:30:00+05:30',latitude:19.076,longitude:72.8777,speed:42};
  await svc.command('integration.import',{kind:'gps_position',sourceReference:'GPS export',rows:[position]});assert.equal((await other.integrationState()).records.length,0);
  assert.throws(()=>normalizeEvent('gps_position',{...position,latitude:91}),/Coordinates/);assert.throws(()=>normalizeEvent('gps_position',{...position,latitude:''}),/required/);assert.throws(()=>normalizeEvent('gps_position',{...position,observedAt:'2026-02-30T00:00:00Z'}),/valid date/);assert.throws(()=>normalizeEvent('gps_position',{...position,observedAt:'2026-10-24T10:30:00'}),/timezone/);assert.throws(()=>normalizeEvent('gps_position',{...position,observedAt:'2099-01-01T00:00:00Z'}),/future/);
  await svc.command('integration.import',{kind:'eway_bill',sourceReference:'Existing goods document',rows:[{provider:'Manual record',externalId:'EWB-1',vehicle:'MH-01-AB-1234',observedAt:'2026-10-24T10:30:00+05:30',number:'123456789012',validUntil:'2026-10-26T23:59:00+05:30',documentNumber:'GOODS-123'}]});
  records=await svc.integrationState();assert.equal(records.records.find((r:Row)=>r.kind==='eway_bill').payload.verification,'unverified');assert.equal((await svc.backup()).records.transport_events.length,5);
  const csv='provider,externalId,vehicle,observedAt,amount,direction,plaza\r\nIssuer,TX-1,MH01AB1234,2026-10-24T10:30:00+05:30,250,debit,"Plaza, gate 2"\r\n';assert.equal(parseTransportCsv(csv)[0].plaza,'Plaza, gate 2');assert.throws(()=>parseTransportCsv('a,a\n1,2'),/unique/);assert.throws(()=>parseTransportCsv('a,b\n"oops,2'),/unclosed/);assert.throws(()=>parseTransportCsv('a,b\n1,2,3'),/number of fields/);
  sqlite.close();
});

test('company P&L recognizes earned freight, all provider costs and posted expenses without counting settlements or recoverable tax',async()=>{
  const {db,sqlite}=database(),svc=new TransportService(db,{userId:'finance-owner',email:'finance@example.com'}),other=new TransportService(db,{userId:'finance-other',email:'other@example.com'});
  await svc.command('workspace.create',{name:'Finance Transport'});await other.command('workspace.create',{name:'Other Transport'});
  await svc.command('consignment.save',cn());const trip=(await svc.state(year)).consignments[0];
  await svc.command('payments.save',{id:trip.id,truckFreight:7000,otherCharges:200,advancePaid:4000,balancePaid:0});
  await svc.command('invoice.create',{year,date:'2026-10-24',ids:[trip.id],taxMode:'igst',charges:[{description:'Handling revenue',amount:100}]});
  const vouchers:Row[]=[];
  for(const [category,amount] of [['tolls',300],['rent',1000],['staff',500],['other_income',50],['depreciation',100],['interest',50],['income_tax',20],['asset_purchase',5000]] as [string,number][]){
    const result=await svc.command('finance.save',{year,date:'2026-10-24',category,amount,recoverableTax:category==='rent'?180:0,paidAmount:category==='rent'?1180:0,description:category,consignmentId:category==='tolls'?trip.id:''});vouchers.push(result);
  }
  let value=await svc.financeReport(year);assert.equal(value.report.draftCount,8);assert.equal(value.report.overheads,0);assert.equal(value.report.revenue,1010000);assert.equal(value.report.directCosts,720000);
  for(const voucher of vouchers)await svc.command('finance.post',{id:voucher.id,version:1});
  value=await svc.financeReport(year);assert.equal(value.report.revenue,1010000);assert.equal(value.report.directCosts,750000);assert.equal(value.report.contribution,260000);assert.equal(value.report.overheads,150000);assert.equal(value.report.otherIncome,5000);assert.equal(value.report.operatingProfit,115000);assert.equal(value.report.profitBeforeTax,100000);assert.equal(value.report.netProfit,98000);assert.equal(value.report.excludedMovements,500000);assert.equal(value.report.recoverableTax,18000);assert.equal(value.report.months[0].netProfit,98000);assert.equal(value.report.uncostedTrips,0);
  await assert.rejects(()=>other.command('finance.void',{id:vouchers[0].id,version:2}),/not found/);assert.equal((await other.financeReport(year)).entries.length,0);
  await assert.rejects(()=>svc.command('finance.save',{year,date:'2026-10-24',category:'rent',amount:10,description:'Bad',consignmentId:trip.id}),/Only direct/);
  await assert.rejects(()=>svc.command('finance.save',{year,date:'2026-10-24',category:'rent',amount:10,description:'Bad',paidAmount:11}),/exceed/);
  await assert.rejects(()=>svc.command('finance.save',{year,date:'2026-10-24',category:'invalid',amount:10,description:'Bad'}),/category/);
  await assert.rejects(()=>svc.command('finance.save',{year,date:'2025-01-01',category:'rent',amount:10,description:'Bad'}),/financial year/);
  await assert.rejects(()=>svc.command('finance.post',{id:vouchers[0].id,version:2}),/eligible/);
  await assert.rejects(()=>svc.command('finance.save',{id:vouchers[0].id,year,date:'2026-10-24',category:'tolls',amount:1,description:'Bad',version:2}),/Only draft/);
  const history=sqlite.prepare('SELECT COUNT(*) n FROM audit').get()!.n;
  await assert.rejects(()=>svc.command('finance.void',{id:vouchers[0].id,version:1}),/changed/);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM audit').get()!.n,history);
  await svc.command('finance.void',{id:vouchers[0].id,version:2});assert.equal((await svc.financeReport(year)).report.netProfit,128000);
  await svc.command('consignment.save',{...cn('UNCOSTED'),freight:2000});value=await svc.financeReport(year);assert.equal(value.report.uncostedTrips,1);assert.equal(value.report.revenue,1210000);
  assert.equal((await svc.financeReport(year,'2026-09-01','2026-09-30')).report.revenue,0);await assert.rejects(()=>svc.financeReport(year,'2026-11-01','2026-10-01'),/Start date/);
  await svc.command('team.invite',{email:'finance-member@example.com'});const member=new TransportService(db,{userId:'finance-member',email:'finance-member@example.com'});await member.command('invitation.accept',{id:(await member.state(year)).pending[0].id});await assert.rejects(()=>member.financeReport(year),/owner/);await assert.rejects(()=>member.command('finance.save',{year,category:'rent',amount:10,date:'2026-10-24',description:'Bad'}),/owner/);
  assert.equal((await svc.backup()).records.finance_entries.length,8);sqlite.close();
});
test('password login upgrades legacy SHA256, secures sessions, rate limits and revokes access',async()=>{
  const {db,sqlite}=database(),auth=new AuthService(db),owner=new TransportService(db,{userId:'owner',email:'owner@example.com'});
  await owner.command('workspace.create',{name:'Test Transport'});
  const password='Old password नमस्ते';const legacy=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(password)))));
  await db.prepare('INSERT INTO password_accounts VALUES (?,?,?,?,0,?)').bind('owner','owner@example.com',`legacy-sha256$${legacy}`,'v1',new Date().toISOString()).run();
  assert.equal(await auth.user(null),null);assert.equal(await auth.user(`${cookieName()}=bad`),null);
  await assert.rejects(()=>auth.login('owner@example.com','wrong','1'),/incorrect/);
  await assert.rejects(()=>auth.login('nobody@example.com','wrong','1'),/incorrect/);
  const token=await auth.login(' OWNER@example.com ',password,'1'),cookie=`${cookieName()}=${token}`;
  assert.equal((await auth.user(cookie))!.userId,'owner');
  const account=sqlite.prepare('SELECT * FROM password_accounts').get()!;
  assert.ok(String(account.password_hash).startsWith('scrypt$'));assert.ok(await verifyPassword(password,String(account.password_hash)));
  assert.equal(sqlite.prepare('SELECT token_hash FROM auth_sessions').get()!.token_hash,await digest(token));
  const cookieHeader=sessionCookie(token);assert.ok(cookieHeader.includes('HttpOnly'));assert.ok(cookieHeader.includes('SameSite=Lax'));assert.ok(cookieHeader.includes('Path=/'));
  if(process.env.NODE_ENV==='production'){assert.ok(cookieHeader.includes('; Secure'));assert.ok(cookieHeader.startsWith('__Host-'));}
  assert.throws(()=>sameOrigin(new Request('https://tms.example/api/auth',{method:'POST',headers:{origin:'https://evil.example'}})),/Cross-origin/);
  assert.throws(()=>sameOrigin(new Request('https://tms.example/api/auth',{method:'POST'})),/Cross-origin/);
  sameOrigin(new Request('https://tms.example/api/auth',{method:'POST',headers:{origin:'https://tms.example'}}));
  const second=await auth.login('owner@example.com',password,'2');
  await assert.rejects(()=>auth.changePassword({userId:'owner',email:'owner@example.com'},'wrong','New password 456!','3'),/incorrect/);
  const changed=await auth.changePassword({userId:'owner',email:'owner@example.com'},password,'New password 456!','3');
  assert.equal(await auth.user(cookie),null);assert.equal(await auth.user(`${cookieName()}=${second}`),null);assert.ok(await auth.user(`${cookieName()}=${changed}`));
  await auth.logout(`${cookieName()}=${changed}`);assert.equal(await auth.user(`${cookieName()}=${changed}`),null);
  const expiry=await auth.login('owner@example.com','New password 456!','4');sqlite.prepare('UPDATE auth_sessions SET expires_at=0').run();assert.equal(await auth.user(`${cookieName()}=${expiry}`),null);
  for(let i=0;i<5;i++)await assert.rejects(()=>auth.login('unknown@example.com','wrong','5'),/incorrect/);
  await assert.rejects(()=>auth.login('unknown@example.com','wrong','5'),/Too many/);
  await owner.command('team.create',{email:'member@example.com',password:'Member password 1!'});
  const member=sqlite.prepare('SELECT * FROM memberships WHERE email=?').get('member@example.com')!;
  const memberToken=await auth.login('member@example.com','Member password 1!','6');
  const memberSvc=new TransportService(db,{userId:String(member.user_id),email:'member@example.com'});
  await assert.rejects(()=>memberSvc.command('team.create',{email:'bad@example.com',password:'Unsafe password 1!'}),/owner/);
  await assert.rejects(()=>memberSvc.command('team.password',{id:'owner',password:'Unsafe password 1!'}),/owner/);
  await assert.rejects(()=>owner.command('team.password',{id:'owner',password:'Unsafe password 1!'}),/not found/);
  await owner.command('team.password',{id:member.user_id,password:'Reset password 2!'});assert.equal(await auth.user(`${cookieName()}=${memberToken}`),null);
  await assert.rejects(()=>auth.login('member@example.com','Member password 1!','6'),/incorrect/);
  const resetToken=await auth.login('member@example.com','Reset password 2!','6');
  await owner.command('team.remove',{id:member.user_id});assert.equal(await auth.user(`${cookieName()}=${resetToken}`),null);
  await assert.rejects(()=>auth.login('member@example.com','Reset password 2!','6'),/incorrect/);
  const backup=await owner.backup();assert.ok(!JSON.stringify(backup).includes('scrypt$'));assert.ok(!JSON.stringify(backup).includes(legacy));
  const salted1=await hashPassword('A strong password!'),salted2=await hashPassword('A strong password!');assert.notEqual(salted1,salted2);assert.ok(await verifyPassword('A strong password!',salted1));
  sqlite.close();
});
test('money, financial dates and tax calculations preserve legacy rules',()=>{
  assert.equal(money('1,234.56'),123456);assert.throws(()=>money(-5));assert.throws(()=>dateValue('2026-02-30'));assert.throws(()=>dateValue('2025-10-24',year));
  const totals=invoiceTotals([{freight:1000000,advance:100000}],[{amount:10000}],'igst','');
  assert.equal(totals.balance,910000);assert.equal(totals.igst,45500);assert.equal(totals.total,955500);
  assert.equal(invoiceTotals([{freight:1000000,advance:100000}],[],'igst','consignor').total,900000);
});
test('complete business lifecycle, isolation, invoice history, roles and exports',async()=>{
  const {db,sqlite}=database();const alice=new TransportService(db,{userId:'alice',email:'alice@example.com'});const bob=new TransportService(db,{userId:'bob',email:'bob@example.com'});
  assert.equal((await alice.state(year)).member,null);
  await alice.command('workspace.create',{name:'Alice Transport'});await bob.command('workspace.create',{name:'Bob Transport'});
  await alice.command('profile.save',{transportName:'Alice Transport',address:'Mumbai',gst:'TEST123',bankName:'Example Bank',acNumber:'123456789'});
  await alice.command('company.save',{name:'Acme Logistics',address:'Pune',gst:'CLIENT123'});
  await alice.command('consignment.save',cn());await assert.rejects(()=>alice.command('consignment.save',cn()),/UNIQUE|already exists/);
  let state=await alice.state(year);const first=state.consignments[0];assert.equal(first.freight,1000000);
  assert.equal((await bob.state(year)).consignments.length,0);
  await assert.rejects(()=>bob.command('consignment.delete',{id:first.id}),/not found/);
  await alice.command('payments.save',{id:first.id,truckFreight:'7000',otherCharges:'200',advancePaid:'1000',balancePaid:'6200',paymentDone:true});
  await assert.rejects(()=>alice.command('payments.save',{id:first.id,truckFreight:'7000',advancePaid:0,balancePaid:0,paymentDone:true}),/below/);
  const created=await alice.command('invoice.create',{year,date:'2026-10-24',ids:[first.id],taxMode:'igst',charges:[{description:'Handling',amount:100}]});
  state=await alice.state(year);assert.equal(state.invoices[0].number,1);assert.equal(state.invoices[0].total,955500);
  await assert.rejects(()=>alice.command('invoice.create',{year,date:'2026-10-24',ids:[first.id],taxMode:'none'}),/UNIQUE/);
  assert.equal(sqlite.prepare('SELECT next FROM invoice_sequences').get()!.next,1,'failed invoice must roll back sequence');
  await assert.rejects(()=>alice.command('consignment.delete',{id:first.id}),/linked invoice/);
  await assert.rejects(()=>alice.command('consignment.save',{...cn(),id:first.id}),/invoiced/);
  await alice.command('company.save',{name:'Acme Logistics',address:'Changed address'});
  assert.equal((await alice.state(year)).invoices[0].snapshot.party.address,'Pune','issued snapshot stays immutable');
  await alice.command('invoice.reissue',{year,id:created.id,date:'2026-10-25',ids:[first.id],taxMode:'none'});
  assert.equal(sqlite.prepare('SELECT count(*) n FROM invoice_revisions').get()!.n,1);
  assert.equal((await alice.state(year)).invoices[0].revision,2);
  await alice.command('invoice.paid',{id:created.id,paid:true});await assert.rejects(()=>alice.command('invoice.reissue',{year,id:created.id,ids:[first.id]}),/unpaid/);
  const invoice=(await alice.state(year)).invoices[0];const pdf=await invoicePdf(invoice);assert.equal(new TextDecoder().decode(pdf.slice(0,5)),'%PDF-');assert.ok((await PDFDocument.load(pdf)).getPageCount()>=1);
  const report=await makePdf('Ledger',['CN','Freight'],[['CN-1','7000']]);assert.ok((await PDFDocument.load(report)).getPageCount());
  const backup=await alice.backup();assert.equal(backup.records.invoices.length,1);assert.equal(backup.records.invoice_items.length,1);assert.ok(backup.records.audit.length>=8);
  const member=new TransportService(db,{userId:'member',email:'member@example.com'});await alice.command('team.invite',{email:'member@example.com'});const pending=(await member.state(year)).pending[0];await member.command('invitation.accept',{id:pending.id});
  assert.equal((await member.state(year)).consignments.length,1);await assert.rejects(()=>member.command('profile.save',{transportName:'Bad edit'}),/owner/);await assert.rejects(()=>member.backup(),/owner/);
  await alice.command('team.remove',{id:'member'});assert.equal((await member.state(year)).member,null);
  await alice.command('invoice.delete',{id:created.id});assert.equal((await alice.state(year)).consignments[0].invoice_id,null);await alice.command('consignment.delete',{id:first.id});
  assert.equal((await alice.state(year)).consignments.length,0);
  await alice.command('import.consignments',{year,rows:[cn('IMPORT-1'),cn('IMPORT-2')]});
  await assert.rejects(()=>alice.command('import.consignments',{year,rows:[cn('IMPORT-3'),cn('IMPORT-1')]}),/UNIQUE/);assert.equal((await alice.state(year)).consignments.length,2,'import batch rolls back completely');
  await assert.rejects(()=>alice.command('invoice.create',{year,date:'2026-10-24',ids:['foreign-id']}),/one company/);
  sqlite.close();
});
// Private production-data reconciliation checks remain local; generic synthetic migration tests are retained.
