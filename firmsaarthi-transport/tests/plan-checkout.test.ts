import {test,expect} from 'vitest';
import {database} from './helpers/database';
import {TransportService} from '../lib/service';
import {BillingService} from '../lib/billing';
import {PlanCheckout,checkoutConfig,authenticSignature,signedHmac} from '../lib/plan-checkout';
import type {Row} from '../lib/domain';
import {AuthService,cookieName} from '../lib/auth';
import {env} from './mocks/cloudflare';
import * as route from '../app/api/plan-payments/route';

const runtime={APP_ENV:'staging',RAZORPAY_ENABLED:'true',RAZORPAY_KEY_ID:'rzp_test_fixture',RAZORPAY_KEY_SECRET:'unit-test-only-secret',RAZORPAY_WEBHOOK_SECRET:'unit-test-only-webhook'};
async function fixture(){
  const {db,sqlite}=database(),service=new TransportService(db,{userId:'checkout-owner',email:'owner@checkout.test'});
  await service.command('workspace.create',{name:'Synthetic checkout'});
  const clock=()=>new Date('2030-01-01T10:00:00.000Z'),billing=new BillingService(service,'platform-owner',clock),state=await billing.state(),org=state.subscription.org_id;
  sqlite.prepare('INSERT INTO password_accounts VALUES(?,?,?,?,?,?)').run('checkout-owner','owner@checkout.test','synthetic-only','v1',0,'2030-01-01');
  const orders:Record<string,Row>={},payments:Record<string,Row>={};let calls=0;
  const remote=(async(url:RequestInfo|URL,init?:RequestInit)=>{
    const path=String(url).split('/v1/')[1];
    if(init?.method==='POST'){
      calls++;const input=JSON.parse(String(init.body));const id='order_Unit'+calls;orders[id]={id,...input,status:'created',amount_paid:0,amount_due:input.amount};return Response.json(orders[id]);
    }
    if(path.startsWith('payments/'))return Response.json(payments[path.split('/')[1]]||{});
    if(path.endsWith('/payments'))return Response.json({items:Object.values(payments).filter(p=>p.order_id===path.split('/')[1])});
    return Response.json(orders[path.split('/')[1]]||{});
  }) as typeof fetch;
  const checkout=new PlanCheckout(service,billing,checkoutConfig(runtime),remote,clock);
  function capture(order:Row,id='pay_Unit1',overrides:Row={}){payments[id]={id,order_id:order.orderId,amount:order.amount,currency:'INR',status:'captured',captured:true,amount_refunded:0,...overrides};orders[order.orderId]={...orders[order.orderId],status:'paid',amount_paid:order.amount,amount_due:0};return payments[id];}
  async function verify(order:Row,id='pay_Unit1'){return checkout.verify({id:order.id,orderId:order.orderId,paymentId:id,signature:await signedHmac(runtime.RAZORPAY_KEY_SECRET,order.orderId+'|'+id)});}
  return {db,sqlite,service,billing,org,checkout,capture,verify,orders,payments,remote,clock,calls:()=>calls};
}

test('gateway config is disabled unless environment, key mode and every secret match',()=>{
  expect(checkoutConfig(runtime)?.mode).toBe('test');
  for(const change of [{RAZORPAY_ENABLED:'false'},{APP_ENV:'production'},{APP_ENV:''},{RAZORPAY_KEY_SECRET:''},{RAZORPAY_WEBHOOK_SECRET:''}])expect(checkoutConfig({...runtime,...change})).toBeNull();
  expect(checkoutConfig({...runtime,APP_ENV:'production',RAZORPAY_KEY_ID:'rzp_live_fixture'})?.mode).toBe('live');
});
test('HMAC validates the exact bytes and rejects malformed or changed signatures',async()=>{
  const signature=await signedHmac('fixture','{"event":"payment.captured"}');expect(await authenticSignature('fixture','{"event":"payment.captured"}',signature)).toBe(true);
  for(const candidate of ['x',null,signature.toUpperCase()])expect(await authenticSignature('fixture','{"event":"payment.captured"}',candidate)).toBe(false);
  expect(await authenticSignature('fixture','{ "event":"payment.captured"}',signature)).toBe(false);
});
test('all four plans use server prices; duplicate requests reuse the pending provider order',async()=>{
  for(const [tier,interval,amount] of [['individual','monthly',199900],['individual','yearly',1999900],['team','monthly',349900],['team','yearly',2999900]] as const){
    const f=await fixture();try{const first=await f.checkout.create({requestId:'request-0001',tier,interval,amount:1,currency:'USD'});expect(first.amount).toBe(amount);expect(first.currency).toBe('INR');expect(first.keyId).toBe(runtime.RAZORPAY_KEY_ID);const second=await f.checkout.create({requestId:'request-0002',tier,interval});expect(second.id).toBe(first.id);expect(f.calls()).toBe(1);expect((await f.billing.state()).status).toBe('trial');}finally{f.sqlite.close();}
  }
});
test('only owners can view or create checkout; complimentary access never pays',async()=>{
  const f=await fixture();try{
    f.sqlite.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').run('checkout-member',f.org,'member@checkout.test','MEMBER','2030-01-01');
    const member=new TransportService(f.db,{userId:'checkout-member',email:'member@checkout.test'}),c=new PlanCheckout(member,new BillingService(member,'',f.clock),checkoutConfig(runtime),f.remote,f.clock);
    await expect(c.state()).rejects.toThrow(/owner/);await expect(c.create({tier:'team',requestId:'member-0001'})).rejects.toThrow(/owner/);
    f.sqlite.prepare('UPDATE subscriptions SET exempt=1,exempt_until=NULL WHERE org_id=?').run(f.org);
    await expect(f.checkout.create({tier:'team',requestId:'request-0001'})).rejects.toThrow(/does not require/);expect(f.calls()).toBe(0);
  }finally{f.sqlite.close();}
});
test('Individual rejects multiple active accounts before creating an order; pending plan cannot be switched',async()=>{
  const f=await fixture();try{
    f.sqlite.prepare('INSERT INTO password_accounts VALUES(?,?,?,?,?,?)').run('checkout-member','member@checkout.test','fixture','v1',0,'2030-01-01');
    f.sqlite.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').run('checkout-member',f.org,'member@checkout.test','MEMBER','2030-01-01');
    await expect(f.checkout.create({requestId:'request-0001',tier:'individual'})).rejects.toThrow(/Team/);expect(f.calls()).toBe(0);
    await f.checkout.create({requestId:'request-0002',tier:'team'});await expect(f.checkout.create({requestId:'request-0003',tier:'team',interval:'yearly'})).rejects.toThrow(/pending/);
  }finally{f.sqlite.close();}
});
test('signature alone or an authorised payment never grants access',async()=>{
  const f=await fixture();try{const order=await f.checkout.create({requestId:'request-0001',tier:'individual'});
    await expect(f.checkout.verify({id:order.id,orderId:order.orderId,paymentId:'pay_Unit1',signature:'a'.repeat(64)})).rejects.toThrow(/verification/);
    f.capture(order,'pay_Unit1',{status:'authorized',captured:false});await expect(f.verify(order)).rejects.toThrow(/not confirmed/);
    expect((await f.billing.state()).status).toBe('trial');expect(f.sqlite.prepare('SELECT COUNT(*) n FROM subscription_grants').get()!.n).toBe(0);
  }finally{f.sqlite.close();}
});
test('captured payment activates one calendar term after trial; retries/webhooks never double-extend or alter transport accounts',async()=>{
  const f=await fixture();try{const before=await f.service.financeReport('2026-2027'),order=await f.checkout.create({requestId:'request-0001',tier:'individual'});f.capture(order);
    expect((await f.verify(order)).success).toBe(true);const state=await f.billing.state();expect(state.status).toBe('paid');expect(state.subscription.paid_until).toBe('2030-02-28T10:00:00.000Z');expect(state.payments[0].provider).toBe('razorpay');expect(state.payments[0].amount).toBe(199900);
    expect((await f.verify(order)).alreadyRecorded).toBe(true);
    const event=JSON.stringify({event:'payment.captured',payload:{payment:{entity:{id:'pay_Unit1',order_id:order.orderId}}}});
    expect((await f.checkout.webhook(event,await signedHmac(runtime.RAZORPAY_WEBHOOK_SECRET,event))).alreadyRecorded).toBe(true);
    expect(f.sqlite.prepare('SELECT COUNT(*) n FROM subscription_grants').get()!.n).toBe(1);expect((await f.billing.state()).subscription.paid_until).toBe(state.subscription.paid_until);
    expect(await f.service.financeReport('2026-2027')).toEqual(before);
  }finally{f.sqlite.close();}
});
test('currency, amount, order identity and refunded payments cannot activate a plan',async()=>{
  for(const overrides of [{amount:1},{currency:'USD'},{order_id:'order_Other'},{amount_refunded:100}]){
    const f=await fixture();try{const order=await f.checkout.create({requestId:'request-0001'});f.capture(order,'pay_Unit1',overrides);try{await f.verify(order);}catch{}expect((await f.billing.state()).status).toBe('trial');expect(f.sqlite.prepare('SELECT COUNT(*) n FROM subscription_grants').get()!.n).toBe(0);}finally{f.sqlite.close();}
  }
});
test('refresh recovers a lost browser callback; tenant cannot confirm another workspace payment',async()=>{
  const f=await fixture();try{const order=await f.checkout.create({requestId:'request-0001',tier:'team',interval:'yearly'});f.capture(order);const other=new TransportService(f.db,{userId:'other-owner',email:'other@checkout.test'});await other.command('workspace.create',{name:'Synthetic other'});
    const c=new PlanCheckout(other,new BillingService(other,'',f.clock),checkoutConfig(runtime),f.remote,f.clock);await expect(c.refresh(order.id)).rejects.toThrow(/not found/);
    expect((await f.checkout.refresh(order.id)).success).toBe(true);expect((await f.billing.state()).subscription.paid_until).toBe('2031-01-31T10:00:00.000Z');
  }finally{f.sqlite.close();}
});
test('team/complimentary changes after checkout preserve captured payment for review without granting wrong access',async()=>{
  const f=await fixture();try{const order=await f.checkout.create({requestId:'request-0001'});f.capture(order);f.sqlite.prepare('UPDATE subscriptions SET exempt=1,version=version+1 WHERE org_id=?').run(f.org);expect((await f.verify(order)).status).toBe('review');expect((await f.billing.state()).status).toBe('exempt');expect(f.sqlite.prepare('SELECT COUNT(*) n FROM subscription_grants').get()!.n).toBe(0);}finally{f.sqlite.close();}
});
test('provider timeout keeps a durable pending intent and never silently creates another order',async()=>{
  const f=await fixture();try{const failed=new PlanCheckout(f.service,f.billing,checkoutConfig(runtime),(async()=>{throw new Error('synthetic network failure');}) as typeof fetch,f.clock);
    await expect(failed.create({requestId:'request-0001'})).rejects.toThrow(/temporarily unavailable/);const next=await f.checkout.create({requestId:'request-0002'});expect(next.status).toBe('creating');expect(f.calls()).toBe(0);
  }finally{f.sqlite.close();}
});
test('webhook raw signature is mandatory; order.paid recovery works; refund/dispute events preserve issued history for review',async()=>{
  const f=await fixture();try{const order=await f.checkout.create({requestId:'request-0001'});f.capture(order);const event=JSON.stringify({event:'order.paid',payload:{order:{entity:{id:order.orderId}}}});
    await expect(f.checkout.webhook(event,'bad')).rejects.toThrow(/signature/);expect((await f.checkout.webhook(event,await signedHmac(runtime.RAZORPAY_WEBHOOK_SECRET,event))).success).toBe(true);
    const expiry=(await f.billing.state()).subscription.paid_until,refund=JSON.stringify({event:'refund.processed',payload:{refund:{entity:{payment_id:'pay_Unit1'}}}});await f.checkout.webhook(refund,await signedHmac(runtime.RAZORPAY_WEBHOOK_SECRET,refund));expect((await f.checkout.state()).pending?.status).toBe('review');expect((await f.billing.state()).subscription.paid_until).toBe(expiry);expect(f.sqlite.prepare('SELECT COUNT(*) n FROM subscription_grants').get()!.n).toBe(1);
  }finally{f.sqlite.close();}
});
test('concurrent callback and webhook batches grant exactly one period',async()=>{
  const f=await fixture();try{
    const batch=f.db.batch;let queue=Promise.resolve();f.db.batch=((statements:any[])=>{const next=queue.then(()=>batch(statements));queue=next.then(()=>undefined,()=>undefined);return next;}) as D1Database['batch'];
    const order=await f.checkout.create({requestId:'request-0001'});f.capture(order);
    const event=JSON.stringify({event:'payment.captured',payload:{payment:{entity:{id:'pay_Unit1',order_id:order.orderId}}}}),signature=await signedHmac(runtime.RAZORPAY_WEBHOOK_SECRET,event);
    const results=await Promise.all([f.verify(order),f.checkout.webhook(event,signature)]);expect(results.every(r=>r.success)).toBe(true);expect(f.sqlite.prepare('SELECT COUNT(*) n FROM subscription_grants').get()!.n).toBe(1);expect((await f.billing.state()).subscription.paid_until).toBe('2030-02-28T10:00:00.000Z');
  }finally{f.sqlite.close();}
});
test('payment HTTP endpoint rejects anonymous, CSRF and read-only support requests',async()=>{
  const f=await fixture();try{
    Object.assign(env,{DB:f.db,...runtime});const token=await new AuthService(f.db).issue('checkout-owner','v1');
    expect((await route.GET(new Request('https://unit.test/api/plan-payments'))).status).toBe(401);
    const cookie=cookieName()+'='+token;
    expect((await route.POST(new Request('https://unit.test/api/plan-payments',{method:'POST',headers:{cookie,origin:'https://other.test'},body:'{}'}))).status).toBe(403);
    expect((await route.GET(new Request('https://unit.test/api/plan-payments',{headers:{cookie:cookie+'; logistrace_support=synthetic'}}))).status).toBe(403);
    const state=await route.GET(new Request('https://unit.test/api/plan-payments',{headers:{cookie}}));expect(state.status).toBe(200);const text=await state.text();expect(text).not.toContain(runtime.RAZORPAY_KEY_SECRET);expect(text).not.toContain(runtime.RAZORPAY_WEBHOOK_SECRET);
  }finally{for(const key of Object.keys(env))delete env[key];f.sqlite.close();}
});
test('an ambiguous order creation is reconciled by exact receipt without issuing another order',async()=>{
  const f=await fixture();try{
    let calls=0;const remote=(async(url:RequestInfo|URL,init?:RequestInit)=>{if(init?.method==='POST'){calls++;const value=JSON.parse(String(init.body));f.orders.order_Recovered={id:'order_Recovered',...value,status:'created'};throw Error('synthetic response lost');}if(String(url).includes('orders?receipt='))return Response.json({items:[...Object.values(f.orders),{id:'order_Unrelated',receipt:'other',amount:1,currency:'INR'}]});return f.remote(url,init);}) as typeof fetch;
    const c=new PlanCheckout(f.service,f.billing,checkoutConfig(runtime),remote,f.clock);await expect(c.create({requestId:'request-0001'})).rejects.toThrow(/temporarily unavailable/);
    const pending=(await c.state()).pending!;expect((await c.refresh(pending.id)).status).toBe('ready');expect(calls).toBe(1);expect((await c.create({requestId:'request-0002'})).orderId).toBe('order_Recovered');
  }finally{f.sqlite.close();}
});
