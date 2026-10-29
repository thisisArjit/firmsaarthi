import { AppError, type TransportService } from './service';
import { required, type Row } from './domain';
import { billingContact, DEFAULT_BILLING_CONTACT } from './billing-contact';
const DAY=86400000;
export function nextBillingMonth(value:string){
  return nextBillingPeriod(value,'monthly');
}
export function billingInterval(value:unknown):'monthly'|'yearly'{if(value===undefined||value==='monthly')return 'monthly';if(value==='yearly')return 'yearly';throw new AppError('Choose monthly or yearly access.');}
export function billingTier(value:unknown):'individual'|'team'{if(value===undefined||value==='individual')return 'individual';if(value==='team')return 'team';throw new AppError('Choose Individual or Team access.');}
export function billingPrice(plan:Row,tier:'individual'|'team',interval:'monthly'|'yearly'){return tier==='team'?(interval==='yearly'?plan.team_yearly_amount:plan.team_monthly_amount):(interval==='yearly'?plan.yearly_amount:plan.monthly_amount);}
export function nextBillingPeriod(value:string,interval:'monthly'|'yearly'){
  const d=new Date(value),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);
  if(interval==='yearly')d.setUTCMonth(d.getUTCMonth()+11);
  const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.toISOString();
}
export function subscriptionAccess(row:Row,now:string,admin=false){
  const exempt=!!row.exempt&&(!row.exempt_until||row.exempt_until>now),paid=!!row.paid_until&&row.paid_until>now,trial=row.trial_ends_at>now;
  return {status:admin?'administrator':exempt?'exempt':paid?'paid':trial?'trial':'expired',allowed:admin||exempt||paid||trial,daysRemaining:trial?Math.ceil((Date.parse(row.trial_ends_at)-Date.parse(now))/DAY):0};
}
export class BillingService {
  constructor(private s:TransportService,private adminId='',private clock=()=>new Date()){}
  private now(){return this.clock().toISOString();}
  async policy():Promise<Row>{
    const existing=await this.s.first("SELECT * FROM billing_policy WHERE id='default'");if(existing)return {...existing,contact:billingContact(existing.contact)};
    await this.s.db.batch([this.s.statement("INSERT OR IGNORE INTO billing_policy (id,trial_days,monthly_amount,contact,version,created_at) VALUES ('default',30,199900,?,1,?)",DEFAULT_BILLING_CONTACT,this.now())]);
    const policy=(await this.s.first("SELECT * FROM billing_policy WHERE id='default'"))!;return {...policy,contact:billingContact(policy.contact)};
  }
  private async membership(){const m=await this.s.first('SELECT m.*,o.owner_id,o.name,o.created_at FROM memberships m JOIN organizations o ON o.id=m.org_id WHERE m.user_id=?',this.s.user.userId);if(!m||!['OWNER','MEMBER','DISPATCHER'].includes(m.role))throw new AppError('Workspace access is unavailable.',403);return m;}
  private admin(m:Row){return !!this.adminId&&this.s.user.userId===this.adminId&&m.role==='OWNER'&&m.owner_id===this.adminId;}
  private async requireAdmin(){const m=await this.membership();if(!this.admin(m))throw new AppError('Only the FirmSaarthi administrator can manage subscriptions.',403);return m;}
  private async subscription(org:Row,policy:Row,create=true){
    const orgId=org.org_id||org.id,existing=await this.s.first('SELECT * FROM subscriptions WHERE org_id=?',orgId);if(existing)return existing;
    const started=new Date(Math.max(Date.parse(org.created_at),Date.parse(policy.created_at))).toISOString(),ends=new Date(Date.parse(started)+policy.trial_days*DAY).toISOString();
    if(!create)return {org_id:orgId,trial_started_at:started,trial_ends_at:ends,paid_until:null,plan_tier:'legacy',exempt:0,exempt_until:null,exemption_reason:'',requested_at:null,requested_interval:'monthly',requested_tier:'individual',version:0};
    await this.s.db.batch([this.s.statement('INSERT OR IGNORE INTO subscriptions (org_id,trial_started_at,trial_ends_at) VALUES (?,?,?)',org.org_id||org.id,started,ends)]);
    return (await this.s.first('SELECT * FROM subscriptions WHERE org_id=?',org.org_id||org.id))!;
  }
  async state(){
    const m=await this.membership(),plan=await this.policy(),row=await this.subscription(m,plan),admin=this.admin(m),asOf=this.now();
    const visible={...row};if(!admin)delete visible.exemption_reason;
    const access=subscriptionAccess(row,asOf,admin),currentPlan=access.status==='exempt'&&row.exempt_tier?{tier:row.exempt_tier,interval:row.exempt_interval,period_start:row.exempt_started_at,period_end:row.exempt_until}:access.status==='paid'?await this.s.first('SELECT tier,interval,period_start,period_end FROM subscription_grants WHERE org_id=? AND period_end>? ORDER BY CASE WHEN period_start<=? THEN 0 ELSE 1 END,period_start LIMIT 1',m.org_id,asOf,asOf):null;
    const effectiveTier=access.status==='exempt'&&row.exempt_tier?row.exempt_tier:row.paid_until>asOf?row.plan_tier:null,restriction=effectiveTier==='individual'&&m.role!=='OWNER'?'Individual access is for the workspace owner. Ask the owner to choose Team for member access.':null;
    return {plan,subscription:visible,...access,allowed:access.allowed&&!restriction,restriction,currentPlan,owner:m.role==='OWNER',admin,asOf,business:m.name,payments:m.role==='OWNER'?await this.s.rows("SELECT g.tier,g.interval,g.period_start,g.period_end,g.amount,g.reference,g.created_at,CASE WHEN c.grant_id IS NOT NULL THEN 'razorpay' ELSE 'manual' END AS provider FROM subscription_grants g LEFT JOIN plan_checkout_orders c ON c.grant_id=g.id WHERE g.org_id=? ORDER BY g.created_at DESC LIMIT 24",m.org_id):[]};
  }
  async requireAccess(){if(!(await this.state()).allowed)throw new AppError('Your trial or plan has ended. Open Manage plan to continue.',402);}
  async adminState(search=''){
    await this.requireAdmin();const plan=await this.policy();if(search.length>100)throw new AppError('Search is too long.');
    const rows=await this.s.rows('SELECT o.id,o.name,o.owner_id,o.created_at,a.email FROM organizations o LEFT JOIN password_accounts a ON a.user_id=o.owner_id WHERE o.name LIKE ? OR a.email LIKE ? ORDER BY o.created_at DESC,o.id LIMIT 100',`%${search}%`,`%${search}%`);
    const customers=[];for(const org of rows){const row=await this.subscription(org,plan,false);customers.push({...org,subscription:row,...subscriptionAccess(row,this.now(),org.owner_id===this.adminId)});}
    return {plan,customers,limit:100};
  }
  async adminUsers(search='',offset=0,account='all'){
    await this.requireAdmin();
    if(search.length>100||!Number.isSafeInteger(offset)||offset<0||offset>1000000||!['all','enabled','disabled'].includes(account))throw new AppError('Choose a valid user search and page.');
    const plan=await this.policy(),asOf=this.now(),limit=25,q=search.trim().toLowerCase();
    const where="(instr(lower(a.email),?)>0 OR instr(lower(COALESCE(o.name,'')),?)>0) AND (?='all' OR a.disabled=?)";
    const args=[q,q,account,account==='disabled'?1:0];
    const from='FROM password_accounts a LEFT JOIN memberships m ON m.user_id=a.user_id LEFT JOIN organizations o ON o.id=m.org_id';
    const total=Number((await this.s.first(`SELECT COUNT(*) AS count ${from} WHERE ${where}`,...args))!.count);
    const rows=await this.s.rows(`SELECT a.user_id,a.email,a.disabled,m.role,m.org_id,m.joined_at,o.name,o.owner_id,o.created_at ${from} WHERE ${where} ORDER BY lower(a.email),a.user_id LIMIT ? OFFSET ?`,...args,limit,offset);
    const users:Row[]=[],cache=new Map<string,Row>();
    for(const user of rows){
      let access:Row={status:'unassigned',plan:'No workspace',expiresAt:null,startsAt:null};
      if(user.org_id&&user.name!==null){
        let sub=cache.get(user.org_id);if(!sub){sub=await this.subscription({id:user.org_id,created_at:user.created_at},plan,false);cache.set(user.org_id,sub);}
        const status=subscriptionAccess(sub,asOf,user.user_id===this.adminId&&user.role==='OWNER'&&user.owner_id===this.adminId).status;
        const grant=status==='paid'?await this.s.first('SELECT tier,interval,period_start FROM subscription_grants WHERE org_id=? AND period_end>? ORDER BY CASE WHEN period_start<=? THEN 0 ELSE 1 END,period_start LIMIT 1',user.org_id,asOf,asOf):null;
        const tier=status==='exempt'?sub.exempt_tier:grant?.tier||sub.plan_tier,interval=status==='exempt'?sub.exempt_interval:grant?.interval;
        const name=tier==='team'?'Team':tier==='individual'?'Individual':'Previous plan';
        const period=interval==='yearly'?'Annual':interval==='monthly'?'Monthly':'';
        access={status,plan:status==='administrator'?'Administrator':status==='trial'?'Free trial':status==='expired'?'No active plan':status==='exempt'?(sub.exempt_tier?`Complimentary · ${name} ${period}`.trim():'Complimentary access'):`${name} ${period}`.trim(),expiresAt:status==='administrator'?null:status==='exempt'?sub.exempt_until||null:status==='trial'?sub.trial_ends_at:status==='paid'?sub.paid_until:[sub.trial_ends_at,sub.paid_until].filter(Boolean).sort().at(-1)||null,startsAt:grant?.period_start||null};
      }
      users.push({userId:user.user_id,email:user.email,disabled:!!user.disabled,role:user.role||null,business:user.name||null,joinedAt:user.joined_at||null,...access});
    }
    return {users,total,offset,limit,next:offset+limit<total?offset+limit:null,asOf};
  }
  async command(action:string,d:Row){
    const s=this.s;
    if(action==='request'){
      const interval=billingInterval(d.interval),tier=billingTier(d.tier);
      const m=await this.membership();if(m.role!=='OWNER')throw new AppError('Ask your workspace owner to manage the subscription.',403);await this.subscription(m,await this.policy());
      await s.db.batch([s.statement('UPDATE subscriptions SET requested_at=CASE WHEN requested_at IS NULL OR requested_interval<>? OR requested_tier<>? THEN ? ELSE requested_at END,version=version+CASE WHEN requested_at IS NULL OR requested_interval<>? OR requested_tier<>? THEN 1 ELSE 0 END,requested_interval=?,requested_tier=? WHERE org_id=?',interval,tier,this.now(),interval,tier,interval,tier,m.org_id)]);return {success:true};
    }
    const administrator=await this.requireAdmin();
    if(action==='extend-active-trials'){
      const policy=await this.policy();if(policy.trial_days!==30){const id=crypto.randomUUID();const changed=await s.db.batch([s.statement("UPDATE billing_policy SET trial_days=30,version=version+1 WHERE id='default' AND version=? RETURNING id",policy.version),s.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',id,administrator.org_id,s.user.userId,'billing.trial-policy','30 days for new and active trials',this.now())]);if(!changed[0].results?.length)throw new AppError('Trial policy changed. Retry after refreshing.',409);}
      const at=this.now(),rows=await s.rows('SELECT * FROM subscriptions WHERE trial_ends_at>? AND exempt=0 AND (paid_until IS NULL OR paid_until<=?)',at,at);let extended=0;
      for(const row of rows){const end=new Date(Date.parse(row.trial_started_at)+30*DAY).toISOString();if(end<=row.trial_ends_at)continue;const audit=crypto.randomUUID(),result=await s.db.batch([s.statement('UPDATE subscriptions SET trial_ends_at=?,version=version+1 WHERE org_id=? AND version=? AND trial_ends_at>? RETURNING org_id',end,row.org_id,row.version,at),s.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',audit,row.org_id,s.user.userId,'billing.trial-extension',JSON.stringify({before:row.trial_ends_at,after:end}),at)]);if(result[0].results?.length)extended++;}return {success:true,extended};
    }
    if(action==='policy'){
      const current=await this.policy(),yearly=Number(d.yearlyAmount===undefined?current.yearly_amount:d.yearlyAmount);if(!Number.isSafeInteger(yearly)||yearly<100||yearly>100000000)throw new AppError('Enter a valid yearly price.');
      const teamMonthly=Number(d.teamMonthlyAmount===undefined?current.team_monthly_amount:d.teamMonthlyAmount),teamYearly=Number(d.teamYearlyAmount===undefined?current.team_yearly_amount:d.teamYearlyAmount);if([teamMonthly,teamYearly].some(n=>!Number.isSafeInteger(n)||n<100||n>100000000))throw new AppError('Enter valid Team plan prices.');
      const days=Number(d.trialDays),amount=Number(d.monthlyAmount),contact=String(d.contact||'').trim();if(!Number.isSafeInteger(days)||days<1||days>365||!Number.isSafeInteger(amount)||amount<100||amount>100000000||contact.length>500)throw new AppError('Use 1–365 trial days, a valid monthly price and contact details up to 500 characters.');
      const result=await s.db.batch([s.statement("UPDATE billing_policy SET trial_days=?,monthly_amount=?,yearly_amount=?,team_monthly_amount=?,team_yearly_amount=?,contact=?,version=version+1 WHERE id='default' AND version=? RETURNING id",days,amount,yearly,teamMonthly,teamYearly,contact,Number(d.version)),s.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',crypto.randomUUID(),(await this.membership()).org_id,s.user.userId,'billing.policy',JSON.stringify({trialDays:days,monthlyAmount:amount,yearlyAmount:yearly,teamMonthlyAmount:teamMonthly,teamYearlyAmount:teamYearly,contact}),this.now())]);if(!result[0].results?.length)throw new AppError('Pricing changed. Reload before saving.',409);return {success:true};
    }
    if(!['exempt','grant'].includes(action))throw new AppError('Unknown subscription action.',404);
    const org=await s.first('SELECT * FROM organizations WHERE id=?',String(d.orgId));if(!org)throw new AppError('Business not found.',404);
    const plan=await this.policy(),row=await this.subscription(org,plan),at=this.now(),expectedVersion=Number(d.version)===0?1:Number(d.version);
    if(action==='exempt'){
      if(typeof d.exempt!=='boolean')throw new AppError('Choose whether to exempt this business.');const reason=required(d.reason,'Reason',500);
      let until:string|null=null;if(d.until){const date=new Date(String(d.until));if(!Number.isFinite(date.getTime())||date.toISOString()<=at)throw new AppError('Choose an exemption end time in the future.');until=date.toISOString();}
      let tier:string|null=null,interval:'monthly'|'yearly'|null=null;
      if(d.exempt&&d.complimentaryPlan){const parts=String(d.complimentaryPlan).split('-');if(parts.length!==2||!['individual','team'].includes(parts[0])||!['monthly','yearly'].includes(parts[1]))throw new AppError('Choose a supported complimentary plan.');tier=parts[0];interval=parts[1] as 'monthly'|'yearly';until=until||nextBillingPeriod(at,interval);if(tier==='individual'&&(await s.first('SELECT COUNT(*) AS count FROM memberships m JOIN password_accounts a ON a.user_id=m.user_id AND a.disabled=0 WHERE m.org_id=?',org.id))!.count>1)throw new AppError('Individual supports one active login. Choose Team for this business.');}
      const auditId=crypto.randomUUID(),result=await s.db.batch([s.statement('UPDATE subscriptions SET exempt=?,exempt_until=?,exemption_reason=?,exempt_tier=?,exempt_interval=?,exempt_started_at=?,version=version+1 WHERE org_id=? AND version=? RETURNING org_id',d.exempt?1:0,d.exempt?until:null,reason,tier,interval,tier?at:null,org.id,expectedVersion),s.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',auditId,administrator.org_id,s.user.userId,'billing.exemption',JSON.stringify({orgId:org.id,before:{exempt:row.exempt,until:row.exempt_until,tier:row.exempt_tier,interval:row.exempt_interval},after:{exempt:d.exempt,until:d.exempt?until:null,tier,interval},reason}),at)]);if(!result[0].results?.length)throw new AppError('Subscription changed. Reload before saving.',409);return {success:true};
    }
    if(d.confirmed!==true)throw new AppError('Confirm that you verified receipt of the payment.');
    const interval=billingInterval(d.interval),tier=billingTier(d.tier),amount=billingPrice(plan,tier,interval);
    const key=required(d.requestId,'Request ID',80);if(!/^[a-zA-Z0-9-]{8,80}$/.test(key))throw new AppError('Invalid request ID.');
    const reference=required(d.reference,'Payment reference',200).toUpperCase(),id=`subscription_${org.id}_${key}`,payload=JSON.stringify({reference,amount:Number(d.amount),...(interval==='yearly'?{interval}:{}),...(tier==='team'?{tier}:{})}),old=await s.first('SELECT * FROM subscription_grants WHERE id=? AND org_id=?',id,org.id);
    if(old){if(old.payload!==payload)throw new AppError('This request ID was used with another payment.',409);return {success:true,alreadyRecorded:true};}
    if(Number(d.amount)!==amount)throw new AppError('The selected plan price changed. Reload and confirm the received amount.',409);
    if(expectedVersion!==row.version)throw new AppError('Subscription changed. Reload before activating.',409);
    if(row.paid_until&&row.paid_until>at&&['individual','team'].includes(row.plan_tier)&&row.plan_tier!==tier)throw new AppError('Keep the current plan until its paid period ends; changing tiers mid-period is not available.');
    if(row.paid_until&&row.paid_until>at&&row.plan_tier==='legacy')throw new AppError('The existing paid period is preserved. Choose a new plan when it ends.');
    if(tier==='individual'&&(await s.first('SELECT COUNT(*) AS count FROM memberships m JOIN password_accounts a ON a.user_id=m.user_id AND a.disabled=0 WHERE m.org_id=?',org.id))!.count>1)throw new AppError('Individual supports one active login. Choose Team for this business or review its team accounts first.');
    const start=new Date(Math.max(Date.parse(at),Date.parse(row.trial_ends_at),row.paid_until?Date.parse(row.paid_until):0)).toISOString(),end=nextBillingPeriod(start,interval),auditId=crypto.randomUUID();
    const result=await s.db.batch([
      s.statement("UPDATE subscriptions SET paid_until=?,plan_tier=?,requested_at=NULL,version=version+1 WHERE org_id=? AND version=? AND (?<>'individual' OR (SELECT COUNT(*) FROM memberships m JOIN password_accounts a ON a.user_id=m.user_id AND a.disabled=0 WHERE m.org_id=subscriptions.org_id)<=1) RETURNING org_id",end,tier,org.id,row.version,tier),
      s.statement('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0',auditId,org.id,s.user.userId,'billing.manual-payment',id,at),
      s.statement('INSERT INTO subscription_grants (id,org_id,period_start,period_end,amount,reference,actor,created_at,payload,interval,tier) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM audit WHERE id=?)',id,org.id,start,end,amount,reference,s.user.userId,at,payload,interval,tier,auditId),
    ]);if(!result[0].results?.length)throw new AppError('Subscription changed. Reload before activating.',409);return {success:true};
  }
}
