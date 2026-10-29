import {AppError,TransportService} from './service';
import {BillingService,billingInterval,billingTier,billingPrice,nextBillingPeriod} from './billing';
import type {Row} from './domain';

export type CheckoutEnvironment={APP_ENV?:string;RAZORPAY_ENABLED?:string;RAZORPAY_KEY_ID?:string;RAZORPAY_KEY_SECRET?:string;RAZORPAY_WEBHOOK_SECRET?:string};
type Config={mode:'test'|'live';keyId:string;secret:string;webhook:string};
class ProviderRequestError extends AppError{constructor(public rejected:boolean){super('Razorpay could not confirm this request. Please contact support if money was deducted.',502);}}
export function checkoutConfig(env:CheckoutEnvironment):Config|null {
  if(env.RAZORPAY_ENABLED!=='true')return null;
  const mode=env.APP_ENV==='staging'?'test':env.APP_ENV==='production'?'live':null;
  if(!mode||!env.RAZORPAY_KEY_ID?.startsWith(`rzp_${mode}_`)||!env.RAZORPAY_KEY_SECRET||!env.RAZORPAY_WEBHOOK_SECRET)return null;
  return {mode,keyId:env.RAZORPAY_KEY_ID,secret:env.RAZORPAY_KEY_SECRET,webhook:env.RAZORPAY_WEBHOOK_SECRET};
}
export async function signedHmac(secret:string,value:string){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export async function authenticSignature(secret:string,value:string,signature:unknown){
  if(typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature))return false;
  const expected=await signedHmac(secret,value);let difference=0;for(let i=0;i<64;i++)difference|=expected.charCodeAt(i)^signature.charCodeAt(i);return difference===0;
}
const publicOrder=(r:Row)=>({id:r.id,tier:r.tier,interval:r.interval,amount:r.amount,currency:r.currency,mode:r.mode,status:r.status,createdAt:r.created_at});
export class PlanCheckout {
  constructor(private s:TransportService,private billing:BillingService,private config:Config|null,private providerFetch:typeof fetch=fetch,private clock=()=>new Date()){}
  private now(){return this.clock().toISOString();}
  private configured(){if(!this.config)throw new AppError('Online payment is not available yet. Contact support for activation.',503);return this.config;}
  private async owner(){await this.s.owner();const state=await this.billing.state();if(!state.owner)throw new AppError('Only the workspace owner can manage payments.',403);return state;}
  async state(){const state=await this.owner();const pending=await this.s.first("SELECT * FROM plan_checkout_orders WHERE org_id=? AND status IN ('creating','ready','review') ORDER BY created_at DESC LIMIT 1",state.subscription.org_id);return {enabled:!!this.config,mode:this.config?.mode||null,pending:pending?publicOrder(pending):null};}
  private async eligible(tier:string){
    const state=await this.owner(),row=state.subscription,at=this.now();
    if(['exempt','administrator'].includes(state.status))throw new AppError('Your current access does not require payment.',409);
    if(row.paid_until>at&&row.plan_tier!==tier)throw new AppError('Renew your current plan type, or change it after the paid period ends.',409);
    const active=await this.s.first('SELECT COUNT(*) AS count FROM memberships m JOIN password_accounts a ON a.user_id=m.user_id AND a.disabled=0 WHERE m.org_id=?',row.org_id);
    if(tier==='individual'&&active!.count>1)throw new AppError('Choose Team for a business with multiple active logins.',409);
    return state;
  }
  private async api(path:string,body?:Row):Promise<Row>{
    const config=this.configured();let response:Response;
    try{response=await this.providerFetch('https://api.razorpay.com/v1/'+path,{method:body?'POST':'GET',headers:{Authorization:'Basic '+btoa(config.keyId+':'+config.secret),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});}
    catch{throw new AppError('Payment confirmation is temporarily unavailable. Check the payment status before trying again.',503);}
    if(!response.ok)throw new ProviderRequestError([400,401,403,404,422].includes(response.status));
    try{return await response.json() as Row;}catch{throw new AppError('Payment confirmation is temporarily unavailable.',503);}
  }
  async create(data:Row):Promise<Row>{
    const config=this.configured(),tier=billingTier(data.tier),interval=billingInterval(data.interval),state=await this.eligible(tier),org=state.subscription.org_id;
    if(typeof data.requestId!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(data.requestId))throw new AppError('Invalid payment request. Reload and try again.');
    let existing=await this.s.first("SELECT * FROM plan_checkout_orders WHERE org_id=? AND (request_id=? OR status IN ('creating','ready','review')) ORDER BY created_at DESC LIMIT 1",org,data.requestId);
    if(existing){if(existing.tier!==tier||existing.interval!==interval)throw new AppError('A different plan checkout is pending. Check its payment status first.',409);return this.checkout(existing);}
    const amount=billingPrice(state.plan,tier,interval);if(!Number.isSafeInteger(amount)||amount<100)throw new AppError('The plan price is unavailable.',503);
    const attempts=await this.s.first('SELECT COUNT(*) AS count FROM plan_checkout_orders WHERE org_id=? AND created_at>?',org,new Date(this.clock().getTime()-86400000).toISOString());if(attempts!.count>=20)throw new AppError('Too many checkout requests. Contact support.',429);
    const id=crypto.randomUUID(),receipt='fs_'+id.replaceAll('-',''),at=this.now();
    try{await this.s.db.batch([this.s.statement("INSERT INTO plan_checkout_orders(id,org_id,actor,request_id,receipt,tier,interval,amount,mode,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'creating',?,?)",id,org,this.s.user.userId,data.requestId,receipt,tier,interval,amount,config.mode,at,at)]);}
    catch(e){if(!/UNIQUE constraint/.test(String(e)))throw e;existing=await this.s.first("SELECT * FROM plan_checkout_orders WHERE org_id=? AND status IN ('creating','ready','review')",org);if(existing&&existing.tier===tier&&existing.interval===interval)return this.checkout(existing);throw new AppError('Another checkout is pending. Refresh Manage plan.',409);}
    // Do not automatically reissue an order after an ambiguous provider timeout.
    // The durable intent preserves its receipt for reconciliation without charging twice.
    let order:Row;try{order=await this.api('orders',{amount,currency:'INR',receipt,notes:{checkout_id:id}});}catch(e){if(e instanceof ProviderRequestError&&e.rejected)await this.s.db.batch([this.s.statement("UPDATE plan_checkout_orders SET status='failed',updated_at=? WHERE id=? AND status='creating'",this.now(),id)]);throw e;}
    if(!/^order_[A-Za-z0-9]+$/.test(order.id)||order.amount!==amount||order.currency!=='INR'||order.receipt!==receipt)throw new AppError('The payment order needs support review.',502);
    await this.s.db.batch([this.s.statement("UPDATE plan_checkout_orders SET provider_order_id=?,status='ready',updated_at=? WHERE id=? AND status='creating'",order.id,this.now(),id)]);
    return this.checkout((await this.s.first('SELECT * FROM plan_checkout_orders WHERE id=?',id))!);
  }
  private checkout(row:Row){
    if(row.mode!==this.configured().mode)throw new AppError('This checkout belongs to another payment environment. Contact support.',409);
    return {...publicOrder(row),...(row.status==='ready'?{keyId:this.configured().keyId,orderId:row.provider_order_id}:{}),...(row.status==='creating'?{message:'Checkout setup is awaiting confirmation. Contact support before making another payment.'}:{}),...(row.status==='review'?{message:'This payment needs support review. Please do not pay again.'}:{})};
  }
  private async owned(id:unknown){const state=await this.owner();if(typeof id!=='string'||id.length>100)throw new AppError('Payment not found.',404);const row=await this.s.first('SELECT * FROM plan_checkout_orders WHERE id=? AND org_id=?',id,state.subscription.org_id);if(!row)throw new AppError('Payment not found.',404);return row;}
  async verify(data:Row){const row=await this.owned(data.id),config=this.configured();if(typeof data.paymentId!=='string'||!/^pay_[a-zA-Z0-9]+$/.test(data.paymentId)||data.orderId!==row.provider_order_id||!await authenticSignature(config.secret,row.provider_order_id+'|'+data.paymentId,data.signature))throw new AppError('Payment verification failed. No plan was activated.',400);return this.fulfil(row,data.paymentId);}
  async refresh(id:unknown):Promise<Row>{
    let row=await this.owned(id);if(row.status==='paid')return {success:true,alreadyRecorded:true};
    if(row.mode!==this.configured().mode)throw new AppError('Payment environment mismatch.',409);
    if(!row.provider_order_id&&row.status==='creating'){
      const found=await this.api('orders?receipt='+encodeURIComponent(row.receipt)+'&count=100');
      const exact=(found.items||[]).filter((o:Row)=>o.receipt===row.receipt);
      if(exact.length!==1)return this.checkout(row);
      const order=exact[0];if(!/^order_[A-Za-z0-9]+$/.test(order.id)||order.currency!==row.currency||order.amount!==row.amount)throw new AppError('Payment order needs support review.',409);
      await this.s.db.batch([this.s.statement("UPDATE plan_checkout_orders SET provider_order_id=?,status='ready',updated_at=? WHERE id=? AND status='creating'",order.id,this.now(),row.id)]);
      row=(await this.s.first('SELECT * FROM plan_checkout_orders WHERE id=?',row.id))!;
    }
    if(!row.provider_order_id)return this.checkout(row);
    const order=await this.api('orders/'+row.provider_order_id);if(order.status!=='paid')return this.checkout(row);const payments=await this.api('orders/'+row.provider_order_id+'/payments'),captured=(payments.items||[]).filter((p:Row)=>p.status==='captured');if(captured.length!==1)throw new AppError('Payment needs support review. Please do not pay again.',409);return this.fulfil(row,captured[0].id);
  }
  private async review(row:Row,paymentId:string,reason:string){
    await this.s.db.batch([this.s.statement("UPDATE plan_checkout_orders SET status='review',payment_id=COALESCE(payment_id,?),updated_at=? WHERE id=?",paymentId,this.now(),row.id),this.s.audit(row.org_id,'billing.payment-review',JSON.stringify({checkout:row.id,reason}))]);
    return {success:false,status:'review',message:'Payment received for review. Contact support; please do not pay again.'};
  }
  private async fulfil(row:Row,paymentId:string):Promise<Row>{
    const fresh=await this.s.first('SELECT * FROM plan_checkout_orders WHERE id=?',row.id);if(fresh!.status==='paid')return {success:true,alreadyRecorded:true};
    if(row.mode!==this.configured().mode||!/^pay_[A-Za-z0-9]+$/.test(paymentId))throw new AppError('Payment environment mismatch.',400);
    const payment=await this.api('payments/'+paymentId),order=await this.api('orders/'+row.provider_order_id);
    if(payment.order_id!==row.provider_order_id||order.id!==row.provider_order_id||payment.amount!==row.amount||order.amount!==row.amount||payment.currency!=='INR'||order.currency!=='INR'||order.receipt!==row.receipt)throw new AppError('Payment details do not match this plan. No access was activated.',400);
    if(payment.status!=='captured'||payment.captured!==true||order.status!=='paid'||order.amount_paid!==row.amount||order.amount_due!==0)throw new AppError('Payment is not confirmed yet. Check its status shortly.',409);
    if(payment.amount_refunded||payment.refunded)return this.review(row,paymentId,'Payment refunded before activation');
    for(let attempt=0;attempt<3;attempt++){
      const subscription=await this.s.first('SELECT * FROM subscriptions WHERE org_id=?',row.org_id),at=this.now();
      if(!subscription)throw new AppError('The workspace needs support review.',409);
      const org=await this.s.first('SELECT owner_id FROM organizations WHERE id=?',row.org_id);
      if(org?.owner_id!==row.actor)return this.review(row,paymentId,'Workspace owner changed after checkout');
      if(subscription.exempt&&(!subscription.exempt_until||subscription.exempt_until>at))return this.review(row,paymentId,'Complimentary access granted after checkout');
      if(subscription.paid_until>at&&subscription.plan_tier!==row.tier)return this.review(row,paymentId,'Plan type changed after checkout');
      const active=await this.s.first('SELECT COUNT(*) AS count FROM memberships m JOIN password_accounts a ON a.user_id=m.user_id AND a.disabled=0 WHERE m.org_id=?',row.org_id);
      if(row.tier==='individual'&&active!.count>1)return this.review(row,paymentId,'Team accounts added after checkout');
      const start=new Date(Math.max(Date.parse(at),Date.parse(subscription.trial_ends_at),subscription.paid_until?Date.parse(subscription.paid_until):0)).toISOString(),end=nextBillingPeriod(start,row.interval),grant='razorpay_'+row.id,audit=crypto.randomUUID();
      const result=await this.s.db.batch([
        this.s.statement("UPDATE subscriptions SET paid_until=?,plan_tier=?,requested_at=NULL,version=version+1 WHERE org_id=? AND version=? AND (exempt=0 OR (exempt_until IS NOT NULL AND exempt_until<=?)) AND (?<>'individual' OR (SELECT COUNT(*) FROM memberships m JOIN password_accounts a ON a.user_id=m.user_id AND a.disabled=0 WHERE m.org_id=subscriptions.org_id)<=1) AND EXISTS(SELECT 1 FROM plan_checkout_orders c JOIN organizations o ON o.id=c.org_id WHERE c.id=? AND c.status='ready' AND o.owner_id=c.actor) RETURNING org_id",end,row.tier,row.org_id,subscription.version,at,row.tier,row.id),
        this.s.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',audit,row.org_id,row.actor,'billing.razorpay-payment',grant,at),
        this.s.statement('INSERT INTO subscription_grants(id,org_id,period_start,period_end,amount,reference,actor,created_at,payload,interval,tier) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM audit WHERE id=?)',grant,row.org_id,start,end,row.amount,'RAZORPAY:'+paymentId,row.actor,at,JSON.stringify({provider:'razorpay',mode:row.mode,orderId:row.provider_order_id,paymentId}),row.interval,row.tier,audit),
        this.s.statement("UPDATE plan_checkout_orders SET status='paid',payment_id=?,grant_id=?,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM subscription_grants WHERE id=?)",paymentId,grant,at,row.id,grant),
      ]);
      if(result[0].results?.length)return {success:true,periodStart:start,periodEnd:end};
      const done=await this.s.first('SELECT status FROM plan_checkout_orders WHERE id=?',row.id);if(done?.status==='paid')return {success:true,alreadyRecorded:true};
    }
    throw new AppError('Payment is confirmed; access update is pending. Check status again. Do not pay again.',409);
  }
  async webhook(raw:string,signature:unknown){
    const config=this.configured();if(!await authenticSignature(config.webhook,raw,signature))throw new AppError('Invalid webhook signature.',400);
    let body:Row;try{body=JSON.parse(raw);}catch{throw new AppError('Invalid webhook.',400);}
    if(!['payment.captured','order.paid','refund.created','refund.processed','payment.dispute.created'].includes(body.event))return {received:true,ignored:true};
    const payment=body.payload?.payment?.entity,refund=body.payload?.refund?.entity,dispute=body.payload?.dispute?.entity;
    const paymentId=payment?.id||refund?.payment_id||dispute?.payment_id;
    const orderId=payment?.order_id||body.payload?.order?.entity?.id;
    const row=orderId?await this.s.first('SELECT * FROM plan_checkout_orders WHERE provider_order_id=?',orderId):paymentId?await this.s.first('SELECT * FROM plan_checkout_orders WHERE payment_id=?',paymentId):null;
    if(!row)return {received:true,ignored:true};
    if(body.event.startsWith('refund.')||body.event==='payment.dispute.created'){await this.review(row,paymentId,'Provider reported '+body.event+'; manual access review required');return {received:true,review:true};}
    if(!paymentId){const payments=await this.api('orders/'+row.provider_order_id+'/payments'),found=(payments.items||[]).find((p:Row)=>p.status==='captured');if(!found)throw new AppError('Captured payment is not available yet.',409);return this.fulfil(row,found.id);}
    return this.fulfil(row,paymentId);
  }
}
