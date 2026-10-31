import { PRICE, DAY, SUPPORT, SiteError, validateBrief, digest, accessState, websiteAddress, oneYearFrom, verifySignature, publicBrief, type Brief } from './site-domain';
import { SiteAuth } from './site-auth';
import {sharedEnabled,sharedCall,mailConfigured,sendMail} from './shared-integrations';
export type Row = Record<string, any>;
export type SiteEnv = { DB?: D1Database; BUCKET?: R2Bucket; ADMIN_EMAIL?: string; RAZORPAY_ENABLED?: string; RAZORPAY_KEY_ID?: string; RAZORPAY_KEY_SECRET?: string; RAZORPAY_WEBHOOK_SECRET?: string; RESEND_API_KEY?: string; MAIL_FROM?: string; PUBLIC_URL?: string; GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string; GOOGLE_REDIRECT_URI?: string; AUTOMATION_SECRET?: string; SHARED_INTEGRATIONS_ENABLED?:string; SHARED_INTEGRATIONS_SECRET?:string; SHARED_INTEGRATIONS_URL?:string; FIRMSAARTHI_SSO_ENABLED?:string; APP_ENV?:string; STAGING_BRIDGE_RELAY_ENABLED?:string };
export class SiteService {
  constructor(public env: SiteEnv, public request: Request, public transport: typeof fetch = fetch, public clock = () => new Date()) {}
  get db() { if (!this.env.DB) throw new SiteError('The request service is temporarily unavailable.',503); return this.env.DB; }
  now() { return this.clock().toISOString(); }
  stmt(sql: string, ...values: any[]) { return this.db.prepare(sql).bind(...values); }
  async first(sql: string, ...values: any[]): Promise<Row|null> { return this.stmt(sql,...values).first<Row>(); }
  async rows(sql: string, ...values: any[]) { return (await this.stmt(sql,...values).all<Row>()).results; }
  admin() { const email=this.request.headers.get('oai-authenticated-user-email'); return !!this.env.ADMIN_EMAIL && !!this.request.headers.get('oai-authenticated-user-id') && email?.toLowerCase()===this.env.ADMIN_EMAIL.toLowerCase(); }
  requireAdmin() { if(!this.admin()) throw new SiteError('Sign in with the FirmSaarthi administrator account.',403); }
  async limit(kind: string, maximum: number) {
    const ip=this.request.headers.get('cf-connecting-ip') || 'local';
    const key=await digest(kind+':'+ip+':'+this.now().slice(0,13));
    const r=await this.first('INSERT INTO site_rate_limits(id,count,expires_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count',key,new Date(this.clock().getTime()+2*3600000).toISOString());
    if(r!.count>maximum) throw new SiteError('Too many requests. Please try again in an hour.',429);
  }
  async owned(id: string) {
    if(!/^FS-[A-F0-9]{16}$/.test(id)) throw new SiteError('Request not found.',404);
    const row=await this.first('SELECT * FROM site_requests WHERE id=?',id);
    const token=(this.request.headers.get('authorization')||'').replace(/^Bearer /,'');
    const user=await new SiteAuth(this).user();
    if(!row || (!this.admin() && row.owner_id!==user?.id && (!/^[a-f0-9]{64}$/.test(token) || await digest(token)!==row.token_hash))) throw new SiteError('Sign in or use your private tracking link to open this request.',404);
    return row;
  }
  async event(id: string,status: string,message: string) { await this.stmt('INSERT INTO site_events(id,request_id,status,message,created_at) VALUES (?,?,?,?,?)',crypto.randomUUID(),id,status,message,this.now()).run(); }
  async queue(row: Row, key: string, subject: string, body: string) {
    await this.stmt('INSERT OR IGNORE INTO site_outbox(id,request_id,recipient,subject,body,created_at) VALUES (?,?,?,?,?,?)',key,row.id,row.email,subject,body,this.now()).run();
  }
  async flush(id?: string) {
    if(!mailConfigured(this.env)) return {sent:0,configured:false};
    const messages=await this.rows('SELECT * FROM site_outbox WHERE status=?'+(id?' AND request_id=?':'')+' ORDER BY created_at LIMIT 10',...(['pending',...(id?[id]:[])])); let sent=0;
    for(const m of messages) {
      try {
        await sendMail(this.env,{id:m.id,to:m.recipient,subject:m.subject,text:m.body},this.transport);
        await this.stmt("UPDATE site_outbox SET status='sent',sent_at=?,attempts=attempts+1 WHERE id=?",this.now(),m.id).run(); sent++;
      } catch { await this.stmt('UPDATE site_outbox SET attempts=attempts+1 WHERE id=?',m.id).run(); }
    }
    return {sent,configured:true};
  }
  async submit(data: unknown) {
    await this.limit('submit',6); const brief=validateBrief(data);
    const user=await new SiteAuth(this).user();
    if(!user) throw new SiteError('Verify your email to send your website brief. Your draft stays saved.',401);
    if(brief.email.toLowerCase()!==user.email) throw new SiteError('Use your verified account email for website updates.');
    brief.email=user.email;
    const previous=await this.first('SELECT id,owner_id,brief,status FROM site_requests WHERE slug=?',brief.slug);
    if(previous){
      if(previous.owner_id===user.id&&previous.brief===JSON.stringify(brief))return {id:previous.id,token:'',trackingUrl:(this.env.PUBLIC_URL||new URL(this.request.url).origin)+'/track/'+previous.id,status:previous.status};
      throw new SiteError('That address is reserved. Please choose another.',409);
    }
    const id='FS-'+crypto.randomUUID().replaceAll('-','').slice(0,16).toUpperCase();
    const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
    const now=this.now(), status=brief.domainType==='custom'?'consultation':'submitted';
    try { await this.db.batch([
      this.stmt('INSERT INTO site_requests(id,token_hash,business,email,slug,domain_type,brief,status,created_at,updated_at,owner_id,delivery_due_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',id,await digest(token),brief.business,brief.email,brief.slug,brief.domainType,JSON.stringify(brief),status,now,now,user.id,status==='consultation'?null:new Date(this.clock().getTime()+DAY).toISOString()),
      this.stmt('INSERT INTO site_events(id,request_id,status,message,created_at) VALUES (?,?,?,?,?)',crypto.randomUUID(),id,status,status==='consultation'?'Custom domain consultation requested.':brief.domainType==='path'?'Your details are saved. Your website is ready for instant launch.':'Your brief has been received. Your website will be live within 24 hours.',now),
    ]); } catch(e) { if(String(e).includes('UNIQUE')) throw new SiteError('That address was just reserved. Please choose another.',409); throw e; }
    const origin=this.env.PUBLIC_URL||new URL(this.request.url).origin;
    const track=`${origin}/track/${id}#${token}`;
    await this.queue({id,email:brief.email},'submitted-'+id,'We have your website brief — '+id,`Hello ${brief.contactName},\n\nWe have received the brief for ${brief.business}.\n\n${status==='consultation'?'Please contact '+SUPPORT+' to discuss your custom domain, pricing and timeline.':brief.domainType==='path'?'Your details are saved. Your FirmSaarthi page address supports instant launch from the form or your website dashboard. We will email you the link once it is live. Your free 3-day preview starts at first publication. Keep it online afterwards for ₹1,999/year.':'Your website will be live within 24 hours. Your free 3-day preview begins when it goes live. We will email you when it is ready. Keep it online afterwards for ₹1,999/year.'}\n\nYour private tracking link (keep it safe):\n${track}\n\nSupport: ${SUPPORT}`);
    await this.queue({id,email:SUPPORT},'operator-'+id,'New website brief — '+brief.business,`New ${status==='consultation'?'custom-domain consultation':'website request'}: ${id}\nBusiness: ${brief.business}\nContact: ${brief.contactName} · ${brief.phone} · ${brief.email}\n${status==='consultation'?'Arrange domain consultation.':'Delivery target: '+new Date(this.clock().getTime()+DAY).toISOString()}\n\nReview the brief and images in ${origin}/admin. Verify the chosen address before publishing.`);
    await this.flush(id);
    return {id,token,trackingUrl:track,status};
  }
  async launch(id:string){
    const user=await new SiteAuth(this).requireUser(),row=await this.owned(id);
    if(row.owner_id!==user.id)throw new SiteError('Only the verified owner can launch this website.',403);
    if(row.domain_type!=='path')throw new SiteError('Instant launch is available for www.firmsaarthi.com addresses. Subdomains need our domain setup first.',409);
    if(row.status==='suspended')throw new SiteError('Contact support to restore this website.',409);
    if(row.published_at)return this.detail(id);
    if(!['submitted','building'].includes(row.status))throw new SiteError('Please finish the requested details before launching your website.',409);
    await this.limit('instant-launch',6);
    const brief=validateBrief(JSON.parse(row.brief));
    const now=this.now(),trial=new Date(this.clock().getTime()+3*DAY).toISOString();
    const result=await this.db.batch([
      this.stmt("UPDATE site_requests SET brief=?,status='preview',published_at=?,trial_ends_at=?,updated_at=?,version=version+1 WHERE id=? AND published_at IS NULL AND version=? RETURNING id",JSON.stringify(brief),now,trial,now,id,row.version),
      this.stmt("INSERT INTO site_events(id,request_id,status,message,created_at) SELECT ?,?,'preview',?,? WHERE changes()>0",crypto.randomUUID(),id,'Your website is live. Your 3-day free preview starts now.',now),
    ]);
    if(!result[0].results?.length){const latest=await this.owned(id);if(latest.published_at)return this.detail(id);throw new SiteError('Your details changed. Refresh before launching.',409);}
    await this.queue(row,'instant-ready-'+id,'Your website is live — '+brief.business,`Your website is ready:\n${websiteAddress(brief)}\n\nYour free 3-day preview ends at ${trial}. Keep it online afterwards for ₹1,999/year. There is no automatic charge.\n\nManage your website: ${this.env.PUBLIC_URL||new URL(this.request.url).origin}/track/${id}\n${SUPPORT}`);
    await this.flush(id);return this.detail(id);
  }
  async detail(id: string) {
    const row=await this.owned(id), brief=JSON.parse(row.brief) as Brief;
    return {id:row.id,business:row.business,email:row.email,brief,status:row.status,access:accessState(row,this.clock().getTime()),createdAt:row.created_at,deliveryDueAt:row.delivery_due_at,publishedAt:row.published_at,trialEndsAt:row.trial_ends_at,paidUntil:row.paid_until,updatedAt:row.updated_at,version:row.version,
      address:websiteAddress(brief),previewPath:`/w/${row.slug}`,events:await this.rows('SELECT status,message,created_at FROM site_events WHERE request_id=? ORDER BY created_at',id),
      assets:await this.rows('SELECT id,name,type,size,kind FROM site_assets WHERE request_id=?',id),
      payment:await this.first('SELECT status,provider_id,payment_id,paid_at FROM site_orders WHERE request_id=? ORDER BY created_at DESC LIMIT 1',id),
      emailStatus:await this.rows('SELECT subject,status,sent_at FROM site_outbox WHERE request_id=? ORDER BY created_at',id),
      paymentEnabled:this.paymentConfigured()};
  }
  async mine() { const user=await new SiteAuth(this).requireUser(); return {user,requests:await this.rows('SELECT id,business,slug,domain_type,status,created_at,published_at,trial_ends_at,paid_until,version FROM site_requests WHERE owner_id=? ORDER BY created_at DESC',user.id)}; }
  async customerUpdate(id: string, data: Row) {
    const user=await new SiteAuth(this).requireUser(), row=await this.owned(id);
    if(row.owner_id!==user.id) throw new SiteError('Only the account owner can update this website.',403);
    await this.limit('website-edit',60);
    await new SiteAuth(this).emailLimit(user.email,'website-edit',30);
    const brief=validateBrief(data.brief);
    if(brief.slug!==row.slug || brief.domainType!==row.domain_type) throw new SiteError('Contact support to change your reserved website address.');
    if(brief.email!==JSON.parse(row.brief).email) throw new SiteError('Contact support to change the notification email.');
    const at=this.now();
    const changed=await this.db.batch([
      this.stmt('UPDATE site_requests SET brief=?,business=?,updated_at=?,status=?,delivery_due_at=?,version=version+1 WHERE id=? AND owner_id=? AND version=? RETURNING id',JSON.stringify(brief),brief.business,at,row.status==='needs_details'?'building':row.status,row.status==='needs_details'?new Date(this.clock().getTime()+DAY).toISOString():row.delivery_due_at,id,user.id,data.version),
      this.stmt("INSERT INTO site_events(id,request_id,status,message,created_at) SELECT ?,?,'updated','You updated your website content.',? WHERE changes()>0",crypto.randomUUID(),id,at),
    ]);
    if(!changed[0].results?.length) throw new SiteError('This request changed in another tab. Refresh before saving.',409);
    if(row.status==='needs_details')await this.stmt("UPDATE site_outbox SET status='superseded' WHERE request_id=? AND status='pending' AND id LIKE 'needs_details-%'",id).run();
    await this.queue(row,`edit-${id}-${row.version}`,'Your website details have been updated',`Your changes to ${brief.business} are saved. ${row.published_at?'They are now reflected on your website.':'We will use the updated details for your website.'}\n\nIf you did not make these changes, contact ${SUPPORT}.`); await this.flush(id);
    if(!row.published_at){await this.queue({...row,email:SUPPORT},`operator-edit-${id}-${row.version}`,'Website brief updated — '+brief.business,`The customer updated ${id}. Review the latest details in ${this.env.PUBLIC_URL||new URL(this.request.url).origin}/admin.`);await this.flush(id);}
    return this.detail(id);
  }
  async reminders() {
    const now=this.now(), soon=new Date(this.clock().getTime()+DAY).toISOString();
    const deliveries=await this.rows("SELECT * FROM site_requests WHERE published_at IS NULL AND status IN ('submitted','building') AND delivery_due_at<=?",new Date(this.clock().getTime()+6*3600000).toISOString());
    for(const row of deliveries){const overdue=row.delivery_due_at<=now;await this.queue({...row,email:SUPPORT},`${overdue?'delivery-overdue':'delivery-due'}-${row.id}-${row.delivery_due_at.replace(/\D/g,'')}`,`${overdue?'Overdue':'Due soon'}: website delivery — ${row.business}`,`${row.id} is ${overdue?'past its delivery target':'due within 6 hours'}.\nTarget: ${row.delivery_due_at}\n\nReview and publish the website, or contact the customer if information is missing.\n${this.env.PUBLIC_URL||'https://sites.firmsaarthi.com'}/admin`);}
    const previews=await this.rows("SELECT * FROM site_requests WHERE trial_ends_at IS NOT NULL AND trial_ends_at<=? AND paid_until IS NULL AND status<>'suspended'",soon);
    for(const row of previews) {
      const expired=row.trial_ends_at<=now;
      await this.queue(row,`${expired?'preview-expired':'preview-ending'}-${row.id}`,expired?'Your website preview has ended':'Your website preview ends within 24 hours',`${row.business}: ${expired?'your free preview has ended. Your details are saved, and payment will bring your website back online.':'your free preview ends at '+row.trial_ends_at+'.'}\n\nKeep your website online for ₹1,999/year. Sign in at ${this.env.PUBLIC_URL||'https://sites.firmsaarthi.com'}/account to activate your annual plan.\n\nThere is no automatic charge.\n${SUPPORT}`);
    }
    const renewals=await this.rows("SELECT * FROM site_requests WHERE paid_until IS NOT NULL AND paid_until<=? AND status<>'suspended'",new Date(this.clock().getTime()+7*DAY).toISOString());
    for(const row of renewals) {
      const expired=row.paid_until<=now;
      await this.queue(row,`${expired?'annual-expired':'annual-ending'}-${row.id}-${row.paid_until.slice(0,10)}`,expired?'Your annual website plan has ended':'Your website plan renews soon',`${row.business}: your annual website plan ${expired?'has ended':'ends on '+row.paid_until.slice(0,10)}.\n\nYour content remains saved. Renew for ₹1,999/year from ${this.env.PUBLIC_URL||'https://sites.firmsaarthi.com'}/account. No automatic billing.\n\n${SUPPORT}`);
    }
    await this.stmt('DELETE FROM site_rate_limits WHERE expires_at<?',now).run();
    await this.stmt('DELETE FROM site_identity_links WHERE expires_at<?',now).run();
    await this.stmt('DELETE FROM site_email_codes WHERE expires_at<?',now).run();
    await this.stmt('DELETE FROM site_google_flows WHERE expires_at<?',now).run();
    await this.stmt('DELETE FROM site_sessions WHERE expires_at<?',now).run();
    return this.flush();
  }
  async upload(id: string, form: FormData) {
    const row=await this.owned(id); await this.requireWrite(row); await this.limit('upload',40);
    if(!this.env.BUCKET) throw new SiteError('Uploads are temporarily unavailable. Your brief is saved.',503);
    const file=form.get('file'), kind=form.get('kind')==='logo'?'logo':'photo';
    if(!(file instanceof File) || file.size<1 || file.size>5*1024*1024) throw new SiteError('Choose a PNG, JPG or WebP image up to 5 MB.');
    const data=new Uint8Array(await file.arrayBuffer());
    const png=data[0]===137 && data[1]===80 && data[2]===78 && data[3]===71;
    const jpg=data[0]===255 && data[1]===216 && data[2]===255;
    const webp=new TextDecoder().decode(data.slice(0,4))==='RIFF' && new TextDecoder().decode(data.slice(8,12))==='WEBP';
    const mime=png?'image/png':jpg?'image/jpeg':webp?'image/webp':null;
    if(!mime || mime!==file.type) throw new SiteError('Only valid PNG, JPG or WebP images are supported.');
    const count=await this.first('SELECT COUNT(*) AS n FROM site_assets WHERE request_id=?',id);
    if(count!.n>=12) throw new SiteError('A maximum of 12 images is supported.');
    const assetId=crypto.randomUUID(), key=`requests/${id}/${assetId}`;
    await this.env.BUCKET.put(key,data,{httpMetadata:{contentType:mime}});
    try { await this.stmt('INSERT INTO site_assets(id,request_id,object_key,type,name,size,kind,created_at) VALUES (?,?,?,?,?,?,?,?)',assetId,id,key,mime,file.name.slice(0,150),file.size,kind,this.now()).run(); }
    catch(e) { await this.env.BUCKET.delete(key); throw e; }
    return {id:assetId,name:file.name,kind};
  }
  async asset(id: string) {
    const a=await this.first('SELECT a.*,r.status,r.paid_until,r.trial_ends_at FROM site_assets a JOIN site_requests r ON r.id=a.request_id WHERE a.id=?',id);
    if(!a) throw new SiteError('Image not found.',404);
    if(!['active','preview'].includes(accessState(a,this.clock().getTime()))) await this.owned(a.request_id);
    const object=await this.env.BUCKET?.get(a.object_key); if(!object) throw new SiteError('Image not found.',404);
    return new Response(object.body,{headers:{'Content-Type':a.type,'X-Content-Type-Options':'nosniff','Cache-Control':'private, max-age=60'}});
  }
  async removeAsset(id: string, assetId: string) {
    const row=await this.owned(id);await this.requireWrite(row);
    const asset=await this.first('SELECT * FROM site_assets WHERE id=? AND request_id=?',assetId,id);
    if(!asset) throw new SiteError('Image not found.',404);
    await this.env.BUCKET?.delete(asset.object_key);
    await this.stmt('DELETE FROM site_assets WHERE id=? AND request_id=?',assetId,id).run();
    return {success:true};
  }
  async requireWrite(row:Row){if(this.admin())return;const user=await new SiteAuth(this).requireUser();if(user.id!==row.owner_id)throw new SiteError('Only the account owner can update these images.',403);}
  paymentConfigured() { return this.env.RAZORPAY_ENABLED==='true' && /^rzp_(live|test)_/.test(this.env.RAZORPAY_KEY_ID||'') && (sharedEnabled(this.env)||!!this.env.RAZORPAY_KEY_SECRET && !!this.env.RAZORPAY_WEBHOOK_SECRET); }
  async provider(path: string, body?: Row) {
    if(!this.paymentConfigured()) throw new SiteError('Online payments are being connected. Your preview and saved request are safe. Contact '+SUPPORT+'.',503);
    if(sharedEnabled(this.env))return sharedCall(this.env,{action:'payment',path,...(body?{body}:{})},this.transport);
    const res=await this.transport('https://api.razorpay.com/v1/'+path,{method:body?'POST':'GET',signal:AbortSignal.timeout(15000),headers:{Authorization:'Basic '+btoa(this.env.RAZORPAY_KEY_ID+':'+this.env.RAZORPAY_KEY_SECRET),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    if(!res.ok) throw new SiteError('We could not confirm the payment request. If money was deducted, use Check payment before trying again.',502);
    return res.json() as Promise<Row>;
  }
  async order(id: string) {
    const row=await this.owned(id); await this.limit('checkout',20);
    if(row.domain_type==='custom' || !row.published_at || row.status==='suspended') throw new SiteError('Payment is available after your FirmSaarthi preview goes live.',409);
    if(row.paid_until && Date.parse(row.paid_until)>this.clock().getTime()+30*DAY) throw new SiteError('Your website already has an active annual plan. Renewal opens 30 days before expiry.',409);
    if(!this.paymentConfigured()) throw new SiteError('Online payments are being connected. Please contact '+SUPPORT+'.',503);
    let order=await this.first('SELECT * FROM site_orders WHERE request_id=? ORDER BY created_at DESC LIMIT 1',id);
    if(order?.status==='review') throw new SiteError('Your payment needs support review. Please do not pay again.',409);
    if(order?.status==='creating') throw new SiteError('Your previous payment order is being confirmed. Use Check payment before trying again.',409);
    if(!order || order.status==='paid') {
      const orderId=crypto.randomUUID();
      const inserted=await this.stmt("INSERT INTO site_orders(id,request_id,status,amount,created_at) SELECT ?,?,'creating',?,? WHERE NOT EXISTS (SELECT 1 FROM site_orders WHERE request_id=? AND status IN ('creating','ready','review')) RETURNING id",orderId,id,PRICE,this.now(),id).all();
      if(!inserted.results.length) throw new SiteError('Another checkout is in progress. Use Check payment.',409);
      const provider=await this.provider('orders',{amount:PRICE,currency:'INR',receipt:orderId,notes:{product:'sites-by-firmsaarthi',request_id:id}});
      if(!/^order_[A-Za-z0-9]+$/.test(provider.id) || provider.amount!==PRICE || provider.currency!=='INR' || provider.receipt!==orderId) throw new SiteError('Payment order could not be verified. Use Check payment.',502);
      await this.stmt("UPDATE site_orders SET provider_id=?,status='ready' WHERE id=?",provider.id,orderId).run();
      order=await this.first('SELECT * FROM site_orders WHERE id=?',orderId);
    }
    return {orderId:order!.provider_id,keyId:this.env.RAZORPAY_KEY_ID,amount:PRICE,currency:'INR',business:row.business,email:row.email,test:this.env.RAZORPAY_KEY_ID!.startsWith('rzp_test_')};
  }
  async fulfil(order: Row, paymentId: string) {
    if(order.status==='paid') return {success:true,alreadyRecorded:true};
    if(order.status==='review') throw new SiteError('Payment needs support review.',409);
    if(!/^pay_[A-Za-z0-9]+$/.test(paymentId)) throw new SiteError('Invalid payment reference.');
    const payment=await this.provider('payments/'+paymentId), provider=await this.provider('orders/'+order.provider_id);
    if(payment.order_id!==order.provider_id || provider.id!==order.provider_id || payment.amount!==PRICE || provider.amount!==PRICE || order.amount!==PRICE || payment.currency!=='INR' || provider.currency!=='INR' || provider.receipt!==order.id) throw new SiteError('Payment details do not match this request. No plan was activated.');
    if(payment.status!=='captured' || payment.captured!==true || provider.status!=='paid' || provider.amount_paid!==PRICE || provider.amount_due!==0) throw new SiteError('Payment is not confirmed yet. Use Check payment shortly.',409);
    if(payment.amount_refunded || payment.refunded) { await this.stmt("UPDATE site_orders SET status='review',payment_id=? WHERE id=?",paymentId,order.id).run(); throw new SiteError('This payment has a refund and needs support review.',409); }
    const row=await this.first('SELECT * FROM site_requests WHERE id=?',order.request_id);
    if(!row || row.status==='suspended') { await this.stmt("UPDATE site_orders SET status='review',payment_id=? WHERE id=?",paymentId,order.id).run(); throw new SiteError('Payment received; website needs support review. Please do not pay again.',409); }
    const now=this.now(), start=new Date(Math.max(this.clock().getTime(), Date.parse(row.trial_ends_at)||0, Date.parse(row.paid_until)||0)).toISOString(), end=oneYearFrom(start);
    const results=await this.db.batch([
      this.stmt("UPDATE site_orders SET status='paid',payment_id=?,paid_at=? WHERE id=? AND status='ready' RETURNING id",paymentId,now,order.id),
      this.stmt("UPDATE site_requests SET paid_until=?,status='active',version=version+1,updated_at=? WHERE id=? AND changes()>0",end,now,row.id),
      this.stmt("INSERT INTO site_events(id,request_id,status,message,created_at) SELECT ?,?,'active',?,? WHERE changes()>0",'payment-'+order.id,row.id,'Annual plan activated. Paid access valid until '+end.slice(0,10)+'.',now),
    ]);
    if(results[0].results?.length) {
      await this.stmt("UPDATE site_outbox SET status='superseded' WHERE request_id=? AND status='pending' AND (id LIKE 'preview-%' OR id LIKE 'annual-%')",row.id).run();
      await this.queue(row,'paid-'+order.id,'Your website annual plan is active',`${row.business} is now on the ₹1,999 annual plan.\n\nValid until: ${end.slice(0,10)}\nWebsite: ${websiteAddress(JSON.parse(row.brief))}\nPayment reference: ${paymentId}\n\nSupport: ${SUPPORT}`); await this.flush(row.id);
    }
    return {success:true,paidUntil:end};
  }
  async verify(id: string, data: Row) {
    await this.owned(id); const order=await this.first('SELECT * FROM site_orders WHERE request_id=? AND provider_id=?',id,data.razorpay_order_id);
    if(!order) throw new SiteError('Payment signature could not be verified.');
    const valid=sharedEnabled(this.env)?(await sharedCall(this.env,{action:'verify-checkout',orderId:order.provider_id,paymentId:data.razorpay_payment_id,signature:data.razorpay_signature},this.transport)).valid:!!this.env.RAZORPAY_KEY_SECRET&&await verifySignature(this.env.RAZORPAY_KEY_SECRET,order.provider_id+'|'+data.razorpay_payment_id,data.razorpay_signature);
    if(!valid)throw new SiteError('Payment signature could not be verified.');
    return this.fulfil(order,data.razorpay_payment_id);
  }
  async reconcile(id: string) {
    await this.owned(id); await this.limit('reconcile',30);
    let order=await this.first('SELECT * FROM site_orders WHERE request_id=? ORDER BY created_at DESC LIMIT 1',id);
    if(!order) return {status:'none'};
    if(order.status==='creating') {
      const list=await this.provider('orders?receipt='+encodeURIComponent(order.id)+'&count=100');
      const found=(list.items||[]).filter((o: Row)=>o.receipt===order!.id);
      if(found.length!==1) throw new SiteError('Order confirmation is pending. Contact support if this persists; please do not pay again.',409);
      const p=found[0]; if(p.amount!==PRICE || p.currency!=='INR' || !/^order_[A-Za-z0-9]+$/.test(p.id)) throw new SiteError('Order needs support review.',409);
      await this.stmt("UPDATE site_orders SET provider_id=?,status='ready' WHERE id=? AND status='creating'",p.id,order.id).run(); order={...order,provider_id:p.id,status:'ready'};
    }
    if(order.status!=='ready') return {status:order.status};
    const p=await this.provider('orders/'+order.provider_id+'/payments');
    const paid=(p.items||[]).filter((v: Row)=>v.status==='captured');
    if(paid.length===1) return this.fulfil(order,paid[0].id);
    return {status:'pending',message:'No captured payment is confirmed yet. You can resume the same checkout.'};
  }
  async webhook(raw: string, signature: string|null) {
    const key=sharedEnabled(this.env)?this.env.SHARED_INTEGRATIONS_SECRET:this.env.RAZORPAY_WEBHOOK_SECRET;
    if(!key || !await verifySignature(key,sharedEnabled(this.env)?'webhook:'+raw:raw,signature)) throw new SiteError('Invalid webhook signature.');
    const body=JSON.parse(raw), payment=body.payload?.payment?.entity, refund=body.payload?.refund?.entity, dispute=body.payload?.dispute?.entity;
    const paymentId=payment?.id||refund?.payment_id||dispute?.payment_id;
    const orderId=payment?.order_id||body.payload?.order?.entity?.id;
    const order=orderId?await this.first('SELECT * FROM site_orders WHERE provider_id=?',orderId):paymentId?await this.first('SELECT * FROM site_orders WHERE payment_id=?',paymentId):null;
    if(!order) return {received:true,ignored:true};
    if(['refund.created','refund.processed','payment.dispute.created'].includes(body.event)) {
      await this.db.batch([this.stmt("UPDATE site_orders SET status='review' WHERE id=?",order.id),this.stmt("UPDATE site_requests SET status='suspended',updated_at=? WHERE id=?",this.now(),order.request_id)]);
      await this.event(order.request_id,'suspended','Payment needs support review. Contact '+SUPPORT+'.');
      return {received:true,review:true};
    }
    if(!['payment.captured','order.paid'].includes(body.event)) return {received:true,ignored:true};
    const payments=paymentId?null:await this.provider('orders/'+order.provider_id+'/payments');
    const captured=paymentId||(payments?.items||[]).find((p: Row)=>p.status==='captured')?.id;
    if(!captured) throw new SiteError('Captured payment not yet available.',409);
    return this.fulfil(order,captured);
  }
  async adminList() { this.requireAdmin(); return {requests:await this.rows('SELECT id,business,email,slug,domain_type,status,created_at,delivery_due_at,published_at,trial_ends_at,paid_until,version FROM site_requests ORDER BY created_at DESC LIMIT 200'),pendingEmails:await this.first("SELECT COUNT(*) AS n FROM site_outbox WHERE status='pending'"),configuration:{payments:this.paymentConfigured(),email:mailConfigured(this.env),uploads:!!this.env.BUCKET}}; }
  async adminUsers(params: URLSearchParams) {
    this.requireAdmin();
    const now=this.now(), search=(params.get('q')||'').trim().slice(0,100), requestedStatus=params.get('status')||'all';
    const statuses=['all','no_website','profile_created','free_preview','paid','expired','suspended'];
    const status=statuses.includes(requestedStatus)?requestedStatus:'all';
    const page=Math.max(1,Math.min(100000,Number.parseInt(params.get('page')||'1',10)||1)), pageSize=50, offset=(page-1)*pageSize;
    const cte=`WITH rollup AS (
      SELECT u.id,u.email,u.name,u.created_at,COUNT(r.id) AS website_count,
        SUM(CASE WHEN r.paid_until IS NOT NULL AND r.paid_until>? THEN 1 ELSE 0 END) AS paid_website_count,
        SUM(CASE WHEN r.published_at IS NOT NULL AND (r.paid_until IS NULL OR r.paid_until<=?) AND r.trial_ends_at>? THEN 1 ELSE 0 END) AS free_preview_count,
        SUM(CASE WHEN r.id IS NOT NULL AND ((r.paid_until IS NOT NULL AND r.paid_until<=?) OR (r.paid_until IS NULL AND r.trial_ends_at IS NOT NULL AND r.trial_ends_at<=?)) THEN 1 ELSE 0 END) AS expired_website_count,
        SUM(CASE WHEN r.status='suspended' THEN 1 ELSE 0 END) AS suspended_website_count,
        MAX(r.created_at) AS last_profile_created_at
      FROM site_users u LEFT JOIN site_requests r ON r.owner_id=u.id GROUP BY u.id
    ), classified AS (
      SELECT *,CASE WHEN paid_website_count>0 THEN 'paid' WHEN free_preview_count>0 THEN 'free_preview'
        WHEN website_count=0 THEN 'no_website' WHEN expired_website_count>0 THEN 'expired' WHEN suspended_website_count>0 THEN 'suspended' ELSE 'profile_created' END AS account_status
      FROM rollup
    )`;
    const timeArgs=[now,now,now,now,now];
    const summary=await this.first(`${cte} SELECT COUNT(*) AS accounts,
      SUM(CASE WHEN website_count>0 THEN 1 ELSE 0 END) AS accounts_with_website,
      SUM(CASE WHEN website_count=0 THEN 1 ELSE 0 END) AS accounts_without_website,
      SUM(CASE WHEN free_preview_count>0 THEN 1 ELSE 0 END) AS accounts_in_preview,
      SUM(CASE WHEN paid_website_count>0 THEN 1 ELSE 0 END) AS accounts_with_paid_website,
      SUM(website_count) AS website_profiles,SUM(free_preview_count) AS free_preview_websites,
      SUM(paid_website_count) AS paid_websites FROM classified`,...timeArgs);
    const where=`WHERE (?='' OR lower(email) LIKE lower(?) OR lower(name) LIKE lower(?)) AND (?='all' OR account_status=?)`;
    const query=`${cte} SELECT id,email,name,created_at,website_count,paid_website_count,free_preview_count,expired_website_count,suspended_website_count,last_profile_created_at,account_status FROM classified ${where} ORDER BY created_at DESC,id LIMIT ? OFFSET ?`;
    const count=await this.first(`${cte} SELECT COUNT(*) AS n FROM classified ${where}`,...timeArgs,search,`%${search}%`,`%${search}%`,status,status);
    const users=await this.rows(query,...timeArgs,search,`%${search}%`,`%${search}%`,status,status,pageSize,offset);
    return {summary,users,page,pageSize,total:count?.n||0,status,search};
  }
  async update(id: string, data: Row) {
    this.requireAdmin(); const row=await this.owned(id);
    if(row.version!==data.version) throw new SiteError('This request changed. Refresh before saving.',409);
    const actions=['building','needs_details','publish','suspend','restore','edit'];
    if(!actions.includes(data.action)) throw new SiteError('Choose a valid request action.');
    if(data.action==='publish' && row.domain_type==='custom') throw new SiteError('Custom domains need a consultation and separate setup.');
    const now=this.now(), brief=data.action==='edit'?validateBrief(data.brief):JSON.parse(row.brief);
    if(data.action==='publish')validateBrief(brief);
    if(brief.slug!==row.slug || brief.domainType!==row.domain_type) throw new SiteError('The reserved address cannot be changed here.');
    const status=data.action==='publish'?(row.paid_until>now?'active':'preview'):data.action==='suspend'?'suspended':data.action==='restore'?(row.paid_until>now?'active':row.published_at?'preview':'building'):data.action==='edit'?row.status:data.action;
    const firstPublish=data.action==='publish'&&!row.published_at;
    const published=firstPublish?now:row.published_at, trial=firstPublish?new Date(this.clock().getTime()+3*DAY).toISOString():row.trial_ends_at;
    const message=data.action==='publish'?'Your website is live. Your free preview lasts 3 days from first publication.':data.action==='edit'?'Your website content has been updated.':String(data.message||({building:'We are building your website.',needs_details:'We need a few more details. Please contact '+SUPPORT+'.',suspend:'Website temporarily suspended. Please contact support.',restore:'Website access has been restored.'} as Row)[data.action]).slice(0,1000);
    const result=await this.db.batch([
      this.stmt('UPDATE site_requests SET status=?,brief=?,published_at=?,trial_ends_at=?,updated_at=?,delivery_due_at=?,version=version+1 WHERE id=? AND version=? RETURNING id',status,JSON.stringify(brief),published,trial,now,data.action==='needs_details'?null:row.delivery_due_at,id,data.version),
      this.stmt('INSERT INTO site_events(id,request_id,status,message,created_at) SELECT ?,?,?,?,? WHERE changes()>0',crypto.randomUUID(),id,status,message,now),
    ]);
    if(!result[0].results?.length) throw new SiteError('This request changed. Refresh before saving.',409);
    if(data.action==='publish'){
      await this.stmt("UPDATE site_outbox SET status='superseded' WHERE request_id=? AND status='pending' AND (id LIKE 'delivery-%' OR id LIKE 'operator-%')",id).run();
    }
    if(data.action!=='edit') { await this.queue(row,`${data.action}-${id}-${row.version}`,'Website update: '+row.business,`${message}\n\n${published?'Website: '+websiteAddress(brief)+'\nPreview link: '+(this.env.PUBLIC_URL||new URL(this.request.url).origin)+'/w/'+row.slug+'\nFree preview ends: '+trial+'\nAnnual plan: ₹1,999/year. No automatic billing.':''}\n\n${SUPPORT}`); await this.flush(id); }
    return this.detail(id);
  }
  async publicSite(slug: string) {
    const row=await this.first('SELECT * FROM site_requests WHERE slug=?',slug);
    if(!row || !['preview','active'].includes(accessState(row,this.clock().getTime()))) return null;
    return {id:row.id,address:websiteAddress(JSON.parse(row.brief)),brief:publicBrief(JSON.parse(row.brief)),assets:await this.rows('SELECT id,kind FROM site_assets WHERE request_id=? ORDER BY created_at',row.id),access:accessState(row,this.clock().getTime())};
  }
}
