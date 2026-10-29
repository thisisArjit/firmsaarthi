import { sqliteTable, text, integer, uniqueIndex, index, check, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const organizations = sqliteTable('organizations', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), name: text('name').notNull(),
  profile: text('profile').notNull().default('{}'), createdAt: text('created_at').notNull(),
});
export const workspacePodPolicies=sqliteTable('workspace_pod_policies',{
  id:text('id').primaryKey(),orgId:text('org_id').notNull().references(()=>organizations.id),version:integer('version').notNull(),podMode:text('pod_mode').notNull(),actor:text('actor').notNull(),createdAt:text('created_at').notNull(),
},t=>[uniqueIndex('workspace_pod_policy_version').on(t.orgId,t.version),check('workspace_pod_policy_mode',sql`${t.podMode} IN ('reference_v1','file_v1')`),check('workspace_pod_policy_positive_version',sql`typeof(${t.version})='integer' AND ${t.version}>0`)]);
export const workspaceStagePolicies=sqliteTable('workspace_stage_policies',{
  id:text('id').primaryKey(),orgId:text('org_id').notNull().references(()=>organizations.id),version:integer('version').notNull(),contractVersion:integer('contract_version').notNull(),
  placementRule:text('placement_rule').notNull(),loadingRule:text('loading_rule').notNull(),arrivalRule:text('arrival_rule').notNull(),actor:text('actor').notNull(),createdAt:text('created_at').notNull(),
},t=>[
  uniqueIndex('workspace_stage_policy_version').on(t.orgId,t.version),
  check('workspace_stage_policy_revision',sql`typeof(${t.version})='integer' AND ${t.version}>0 AND ${t.version}<=9007199254740991`),
  check('workspace_stage_policy_contract',sql`typeof(${t.contractVersion})='integer' AND ${t.contractVersion}=1`),
  check('workspace_stage_policy_placement',sql`${t.placementRule} IN ('optional','accepted_file')`),
  check('workspace_stage_policy_loading',sql`${t.loadingRule} IN ('optional','accepted_file')`),
  check('workspace_stage_policy_arrival',sql`${t.arrivalRule} IN ('optional','accepted_file')`),
]);
export const companyWebsites=sqliteTable('company_websites',{
  orgId:text('org_id').primaryKey().references(()=>organizations.id),slug:text('slug').notNull().unique(),draft:text('draft').notNull(),published:text('published'),publishedAt:text('published_at'),version:integer('version').notNull().default(1),updatedAt:text('updated_at').notNull(),
});
export const supportSessions=sqliteTable('support_sessions',{
  id:text('id').primaryKey(),tokenHash:text('token_hash').notNull().unique(),actor:text('actor').notNull(),orgId:text('org_id').notNull().references(()=>organizations.id),reason:text('reason').notNull(),createdAt:text('created_at').notNull(),expiresAt:text('expires_at').notNull(),endedAt:text('ended_at'),
});
export const entityProfiles=sqliteTable('entity_profiles',{
  id:text('id').primaryKey(),orgId:text('org_id').notNull().references(()=>organizations.id),kind:text('kind').notNull(),entityKey:text('entity_key').notNull(),profile:text('profile').notNull().default('{}'),version:integer('version').notNull().default(1),updatedAt:text('updated_at').notNull(),actor:text('actor').notNull(),
},t=>[uniqueIndex('entity_profile_identity').on(t.orgId,t.kind,t.entityKey)]);
export const supplierRatings=sqliteTable('supplier_ratings',{
  id:text('id').primaryKey(),orgId:text('org_id').notNull().references(()=>organizations.id),supplierKey:text('supplier_key').notNull(),stars:integer('stars').notNull(),version:integer('version').notNull().default(1),actor:text('actor').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[uniqueIndex('supplier_rating_identity').on(t.orgId,t.supplierKey)]);
export const consignmentActivity=sqliteTable('consignment_activity',{
  id:text('id').primaryKey(),orgId:text('org_id').notNull().references(()=>organizations.id),consignmentId:text('consignment_id').notNull().references(()=>consignments.id),kind:text('kind').notNull(),stage:text('stage'),details:text('details').notNull().default('{}'),eventAt:text('event_at'),recordedAt:text('recorded_at').notNull(),actor:text('actor').notNull(),
},t=>[index('consignment_activity_scope').on(t.orgId,t.consignmentId)]);
export const consignmentFiles=sqliteTable('consignment_files',{
  id:text('id').primaryKey(),orgId:text('org_id').notNull().references(()=>organizations.id),consignmentId:text('consignment_id').notNull().references(()=>consignments.id),assetId:text('asset_id').notNull().references(()=>assets.id),category:text('category').notNull(),remark:text('remark').notNull().default(''),sha256:text('sha256').notNull(),bytes:integer('bytes').notNull(),actor:text('actor').notNull(),createdAt:text('created_at').notNull(),
});
export const memberships = sqliteTable('memberships', {
  userId: text('user_id').primaryKey(), orgId: text('org_id').notNull().references(() => organizations.id),
  email: text('email').notNull(), role: text('role').notNull(), joinedAt: text('joined_at').notNull(),
});
export const billingPolicy=sqliteTable('billing_policy',{
  teamMonthlyAmount:integer('team_monthly_amount').notNull().default(349900),teamYearlyAmount:integer('team_yearly_amount').notNull().default(2999900),
  yearlyAmount:integer('yearly_amount').notNull().default(1999900),
  id:text('id').primaryKey(),trialDays:integer('trial_days').notNull(),monthlyAmount:integer('monthly_amount').notNull(),contact:text('contact').notNull().default(''),version:integer('version').notNull().default(1),createdAt:text('created_at').notNull(),
});
export const subscriptions=sqliteTable('subscriptions',{
  exemptTier:text('exempt_tier'),exemptInterval:text('exempt_interval'),exemptStartedAt:text('exempt_started_at'),
  planTier:text('plan_tier').notNull().default('legacy'),requestedTier:text('requested_tier').notNull().default('individual'),
  requestedInterval:text('requested_interval').notNull().default('monthly'),
  orgId:text('org_id').primaryKey().references(()=>organizations.id),trialStartedAt:text('trial_started_at').notNull(),trialEndsAt:text('trial_ends_at').notNull(),paidUntil:text('paid_until'),exempt:integer('exempt').notNull().default(0),exemptUntil:text('exempt_until'),exemptionReason:text('exemption_reason').notNull().default(''),requestedAt:text('requested_at'),version:integer('version').notNull().default(1),
});
export const subscriptionGrants=sqliteTable('subscription_grants',{
  tier:text('tier').notNull().default('legacy'),
  interval:text('interval').notNull().default('monthly'),
  id:text('id').primaryKey(),orgId:text('org_id').notNull().references(()=>organizations.id),periodStart:text('period_start').notNull(),periodEnd:text('period_end').notNull(),amount:integer('amount').notNull(),reference:text('reference').notNull(),actor:text('actor').notNull(),createdAt:text('created_at').notNull(),payload:text('payload').notNull(),
},t=>[uniqueIndex('subscription_payment_reference').on(t.orgId,t.reference)]);
export const invitations = sqliteTable('invitations', {
  id: text('id').primaryKey(), orgId: text('org_id').notNull().references(() => organizations.id),
  email: text('email').notNull(), createdAt: text('created_at').notNull(),
}, t => [uniqueIndex('invitations_org_email').on(t.orgId, t.email)]);
export const companies = sqliteTable('companies', {
  id: text('id').primaryKey(), orgId: text('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(), address: text('address').notNull().default(''), gst: text('gst').notNull().default(''),
  legacyKey: text('legacy_key'),
}, t => [uniqueIndex('companies_org_name').on(t.orgId, t.name).where(sql`${t.legacyKey} IS NULL`), uniqueIndex('companies_legacy_source').on(t.orgId,t.legacyKey)]);
export const businessLeads=sqliteTable('business_leads',{
  phone:text('phone').notNull().default(''),email:text('email').notNull().default(''),contactSourceUrl:text('contact_source_url').notNull().default(''),contactCheckedOn:text('contact_checked_on').notNull().default(''),
  id:text('id').primaryKey(),orgId:text('org_id').notNull().references(()=>organizations.id),
  name:text('name').notNull(),city:text('city').notNull(),area:text('area').notNull().default(''),industry:text('industry').notNull().default(''),
  sourceUrl:text('source_url').notNull().default(''),notes:text('notes').notNull().default(''),status:text('status').notNull().default('research'),
  companyId:text('company_id').references(()=>companies.id),version:integer('version').notNull().default(1),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[uniqueIndex('business_lead_name_city').on(t.orgId,t.name,t.city)]);
export const parties = sqliteTable('parties', {
  id: text('id').primaryKey(), orgId: text('org_id').notNull().references(() => organizations.id), code: text('code').notNull(),
  kind: text('kind').notNull(), name: text('name').notNull(), version: integer('version').notNull().default(1), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
},t=>[uniqueIndex('party_org_code').on(t.orgId,t.code)]);
export const partyAliases = sqliteTable('party_aliases', {
  id: text('id').primaryKey(), orgId: text('org_id').notNull().references(() => organizations.id), partyId: text('party_id').notNull().references(() => parties.id),
  kind: text('kind').notNull(), alias: text('alias').notNull(), createdAt: text('created_at').notNull(),
},t=>[uniqueIndex('party_source_alias').on(t.orgId,t.kind,t.alias)]);
export const consignments = sqliteTable('consignments', {
  stageStatus:text('stage_status'),stageVersion:integer('stage_version').notNull().default(1),
  id: text('id').primaryKey(), orgId: text('org_id').notNull().references(() => organizations.id),
  year: text('year').notNull(), cn: text('cn').notNull(), date: text('date').notNull(), company: text('company').notNull(),
  truck: text('truck').notNull(), origin: text('origin').notNull(), destination: text('destination').notNull(),
  rate: integer('rate').notNull().default(0), weight: text('weight').notNull().default('0'),
  rateLabel: text('rate_label'),
  freight: integer('freight').notNull(), advance: integer('advance').notNull().default(0),
  method: text('method').notNull().default('Billed'), provider: text('provider').notNull().default(''),
  truckFreight: integer('truck_freight').notNull().default(0), otherCharges: integer('other_charges').notNull().default(0),
  advancePaid: integer('advance_paid').notNull().default(0), balancePaid: integer('balance_paid').notNull().default(0),
  advanceDate: text('advance_date').notNull().default(''), balanceDate: text('balance_date').notNull().default(''),
  paymentDone: integer('payment_done').notNull().default(0), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
  providerDueDate: text('provider_due_date'), providerVersion: integer('provider_version').notNull().default(1),
  settlementInitialized: integer('settlement_initialized').notNull().default(0),
  supplierPartyId: text('supplier_party_id').references(() => parties.id),
  legacyKey: text('legacy_key'),
}, t => [uniqueIndex('consignments_org_year_cn').on(t.orgId, t.year, t.cn).where(sql`${t.legacyKey} IS NULL`), uniqueIndex('consignments_legacy_source').on(t.orgId,t.legacyKey)]);
export const sequences = sqliteTable('invoice_sequences', {
  orgId: text('org_id').notNull().references(() => organizations.id), year: text('year').notNull(), next: integer('next').notNull(),
}, t => [uniqueIndex('sequences_org_year').on(t.orgId, t.year)]);
export const invoices = sqliteTable('invoices', {
  id: text('id').primaryKey(), orgId: text('org_id').notNull().references(() => organizations.id),
  year: text('year').notNull(), number: integer('number').notNull(), date: text('date').notNull(), company: text('company').notNull(),
  total: integer('total').notNull(), paid: integer('paid').notNull().default(0),
  snapshot: text('snapshot').notNull(), revision: integer('revision').notNull().default(1), createdAt: text('created_at').notNull(),
  customerPartyId: text('customer_party_id').references(() => parties.id), dueDate: text('due_date'), termsVersion: integer('terms_version').notNull().default(1),
}, t => [uniqueIndex('invoices_org_year_number').on(t.orgId, t.year, t.number)]);
export const invoiceTermsHistory = sqliteTable('invoice_terms_history', {
  id: text('id').primaryKey(), orgId: text('org_id').notNull().references(() => organizations.id), invoiceId: text('invoice_id').notNull().references(() => invoices.id),
  dueDate: text('due_date'), note: text('note').notNull(), version: integer('version').notNull(), actor: text('actor').notNull(), createdAt: text('created_at').notNull(),
},t=>[uniqueIndex('invoice_terms_version').on(t.orgId,t.invoiceId,t.version)]);
export const invoiceItems = sqliteTable('invoice_items', {
  invoiceId: text('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  consignmentId: text('consignment_id').notNull().references(() => consignments.id),
}, t => [uniqueIndex('invoice_items_consignment').on(t.consignmentId)]);
export const revisions = sqliteTable('invoice_revisions', {
  id: text('id').primaryKey(), invoiceId: text('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  snapshot: text('snapshot').notNull(), revision: integer('revision').notNull(), createdAt: text('created_at').notNull(),
}, t => [uniqueIndex('invoice_revisions_number').on(t.invoiceId, t.revision)]);
export const assets = sqliteTable('assets', {
  id: text('id').primaryKey(), orgId: text('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(), mime: text('mime').notNull(), createdAt: text('created_at').notNull(),
});
export const audit = sqliteTable('audit', {
  id: text('id').primaryKey(), orgId: text('org_id').notNull().references(() => organizations.id),
  actor: text('actor').notNull(), action: text('action').notNull(), target: text('target').notNull(), createdAt: text('created_at').notNull(),
});
export const importBatches = sqliteTable('import_batches', {
  id: text('id').primaryKey(), orgId: text('org_id').notNull().references(() => organizations.id),
  source: text('source').notNull(), sha256: text('sha256').notNull(), summary: text('summary').notNull(), createdAt: text('created_at').notNull(),
});
export const passwordAccounts = sqliteTable('password_accounts', {
  userId: text('user_id').primaryKey(), email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(), credentialVersion: text('credential_version').notNull(),
  disabled: integer('disabled').notNull().default(0), updatedAt: text('updated_at').notNull(),
});
export const authSessions = sqliteTable('auth_sessions', {
  tokenHash: text('token_hash').primaryKey(), userId: text('user_id').notNull().references(() => passwordAccounts.userId, {onDelete:'cascade'}),
  credentialVersion: text('credential_version').notNull(), expiresAt: integer('expires_at').notNull(),
});
export const authLimits = sqliteTable('auth_limits', {
  key: text('key').primaryKey(), attempts: integer('attempts').notNull(), expiresAt: integer('expires_at').notNull(),
});
export const googleIdentities = sqliteTable('google_identities', {
  subject: text('subject').primaryKey(), userId: text('user_id').notNull().references(()=>passwordAccounts.userId,{onDelete:'cascade'}),
  email: text('email').notNull(), createdAt: text('created_at').notNull(),
},t=>[uniqueIndex('google_identity_user').on(t.userId)]);
export const googleFlows = sqliteTable('google_flows', {
  stateHash:text('state_hash').primaryKey(), browserHash:text('browser_hash').notNull(), nonce:text('nonce').notNull(), verifier:text('verifier').notNull(),
  intent:text('intent').notNull(), userId:text('user_id'), credentialVersion:text('credential_version'), businessName:text('business_name').notNull().default(''),
  expiresAt:integer('expires_at').notNull(),
});
export const financeEntries = sqliteTable('finance_entries', {
  id: text('id').primaryKey(), orgId: text('org_id').notNull().references(() => organizations.id),
  year: text('year').notNull(), date: text('date').notNull(), category: text('category').notNull(),
  description: text('description').notNull(), counterparty: text('counterparty').notNull().default(''),
  reference: text('reference').notNull().default(''), amount: integer('amount').notNull(),
  recoverableTax: integer('recoverable_tax').notNull().default(0), paidAmount: integer('paid_amount').notNull().default(0),
  consignmentId: text('consignment_id').references(() => consignments.id),
  status: text('status').notNull().default('draft'), version: integer('version').notNull().default(1),
  source: text('source').notNull().default('manual'), externalId: text('external_id'),
  createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, t => [uniqueIndex('finance_external_source').on(t.orgId,t.source,t.externalId)]);
export const transportEvents = sqliteTable('transport_events', {
  id: text('id').primaryKey(), orgId: text('org_id').notNull().references(() => organizations.id),
  kind: text('kind').notNull(), provider: text('provider').notNull(), externalId: text('external_id').notNull(),
  vehicle: text('vehicle').notNull(), observedAt: text('observed_at').notNull(), receivedAt: text('received_at').notNull(),
  payload: text('payload').notNull(), sourceReference: text('source_reference').notNull(),
  provenance: text('provenance').notNull().default('imported'),
},t=>[uniqueIndex('transport_event_external').on(t.orgId,t.kind,t.provider,t.externalId)]);
export const invoiceReceipts = sqliteTable('invoice_receipts', {
  id: text('id').primaryKey(), orgId: text('org_id').notNull().references(() => organizations.id),
  invoiceId: text('invoice_id').notNull().references(() => invoices.id,{onDelete:'cascade'}),
  date: text('date'), amount: integer('amount').notNull(), method: text('method').notNull(),
  reference: text('reference').notNull().default(''), status: text('status').notNull().default('posted'),
  source: text('source').notNull().default('manual'), createdAt: text('created_at').notNull(),
  voidedAt: text('voided_at'),
  voidReason: text('void_reason').notNull().default(''),
});
export const staffEmployees = sqliteTable('staff_employees', {
  id: text('id').primaryKey(), orgId: text('org_id').notNull().references(() => organizations.id),
  code: text('code').notNull(), name: text('name').notNull(), designation: text('designation').notNull().default(''),
  branch: text('branch').notNull().default(''), joinedOn: text('joined_on').notNull(), leftOn: text('left_on'),
  version: integer('version').notNull().default(1), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
},t=>[uniqueIndex('staff_employee_code').on(t.orgId,t.code)]);
export const staffSalaryTerms = sqliteTable('staff_salary_terms', {
  id: text('id').primaryKey(), orgId: text('org_id').notNull().references(() => organizations.id),
  employeeId: text('employee_id').notNull().references(() => staffEmployees.id), effectiveFrom: text('effective_from').notNull(),
  monthlyAmount: integer('monthly_amount').notNull(), note: text('note').notNull().default(''), createdAt: text('created_at').notNull(),
  voidedAt: text('voided_at'), voidReason: text('void_reason').notNull().default(''),
},t=>[uniqueIndex('staff_salary_effective').on(t.orgId,t.employeeId,t.effectiveFrom).where(sql`voided_at IS NULL`)]);
export const staffAdvances = sqliteTable('staff_advances', {
  id:text('id').primaryKey(),orgId:text('org_id').notNull().references(()=>organizations.id),employeeId:text('employee_id').notNull().references(()=>staffEmployees.id),
  date:text('date').notNull(),kind:text('kind').notNull(),amount:integer('amount').notNull(),method:text('method').notNull(),reference:text('reference').notNull().default(''),
  status:text('status').notNull().default('posted'),createdAt:text('created_at').notNull(),voidedAt:text('voided_at'),voidReason:text('void_reason').notNull().default(''),
},t=>[index('staff_advance_employee_date').on(t.orgId,t.employeeId,t.date)]);
export const staffPayruns = sqliteTable('staff_payruns', {
  id:text('id').primaryKey(),orgId:text('org_id').notNull().references(()=>organizations.id),period:text('period').notNull(),periodEnd:text('period_end').notNull(),
  status:text('status').notNull().default('draft'),version:integer('version').notNull().default(1),financeEntryId:text('finance_entry_id').references(()=>financeEntries.id),
  createdAt:text('created_at').notNull(),postedAt:text('posted_at'),approvedBy:text('approved_by'),voidedAt:text('voided_at'),voidReason:text('void_reason').notNull().default(''),
},t=>[uniqueIndex('staff_regular_payrun_period').on(t.orgId,t.period).where(sql`status <> 'void'`)]);
export const staffPayrunLines = sqliteTable('staff_payrun_lines', {
  id:text('id').primaryKey(),orgId:text('org_id').notNull().references(()=>organizations.id),payrunId:text('payrun_id').notNull().references(()=>staffPayruns.id),employeeId:text('employee_id').notNull().references(()=>staffEmployees.id),
  snapshot:text('snapshot').notNull(),gross:integer('gross').notNull(),deductions:integer('deductions').notNull().default(0),employerCost:integer('employer_cost').notNull().default(0),
  advanceRecovery:integer('advance_recovery').notNull().default(0),netPay:integer('net_pay').notNull(),reviewed:integer('reviewed').notNull().default(0),note:text('note').notNull().default(''),
},t=>[uniqueIndex('staff_payrun_employee').on(t.orgId,t.payrunId,t.employeeId),index('staff_payrun_employee_lookup').on(t.orgId,t.employeeId)]);
export const staffSalaryPayments = sqliteTable('staff_salary_payments', {
  id:text('id').primaryKey(),orgId:text('org_id').notNull().references(()=>organizations.id),lineId:text('line_id').notNull().references(()=>staffPayrunLines.id),
  date:text('date').notNull(),amount:integer('amount').notNull(),method:text('method').notNull(),reference:text('reference').notNull().default(''),status:text('status').notNull().default('posted'),
  createdAt:text('created_at').notNull(),voidedAt:text('voided_at'),voidReason:text('void_reason').notNull().default(''),
},t=>[index('staff_payment_line').on(t.orgId,t.lineId)]);

export const supplierPayments = sqliteTable('supplier_payments', {
  id: text('id').primaryKey(), orgId: text('org_id').notNull().references(() => organizations.id),
  consignmentId: text('consignment_id').notNull().references(() => consignments.id), providerSnapshot: text('provider_snapshot').notNull(),
  kind: text('kind').notNull(), date: text('date'), amount: integer('amount').notNull(), method: text('method').notNull(),
  reference: text('reference').notNull().default(''), source: text('source').notNull(), status: text('status').notNull().default('posted'),
  createdAt: text('created_at').notNull(), voidedAt: text('voided_at'), voidReason: text('void_reason').notNull().default(''),
},t=>[index('supplier_payment_consignment').on(t.orgId,t.consignmentId)]);

export const invoiceTemplates=sqliteTable('invoice_templates',{
  orgId:text('org_id').primaryKey().references(()=>organizations.id),config:text('config').notNull(),version:integer('version').notNull().default(1),updatedAt:text('updated_at').notNull(),updatedBy:text('updated_by').notNull(),
});
export const tripVehicles = sqliteTable('trip_vehicles', {
  id:text('id').primaryKey(),orgId:text('org_id').notNull().references(()=>organizations.id),registration:text('registration').notNull(),createdAt:text('created_at').notNull(),
},t=>[uniqueIndex('trip_vehicle_registration').on(t.orgId,t.registration)]);
export const trips = sqliteTable('trips', {
  podPolicy:text('pod_policy').notNull().default('reference_v1'),
  id:text('id').primaryKey(),orgId:text('org_id').notNull().references(()=>organizations.id),year:text('year').notNull(),number:text('number').notNull(),
  vehicleId:text('vehicle_id').notNull().references(()=>tripVehicles.id),vehicleSnapshot:text('vehicle_snapshot').notNull(),supplierPartyId:text('supplier_party_id').notNull().references(()=>parties.id),supplierSnapshot:text('supplier_snapshot').notNull(),
  status:text('status').notNull().default('planned'),version:integer('version').notNull().default(1),creationPayload:text('creation_payload').notNull(),createdAt:text('created_at').notNull(),createdBy:text('created_by').notNull(),
},t=>[uniqueIndex('trip_org_number').on(t.orgId,t.year,t.number),index('trip_vehicle_status').on(t.orgId,t.vehicleId,t.status)]);
export const tripAllocations = sqliteTable('trip_allocations', {
  id:text('id').primaryKey(),orgId:text('org_id').notNull().references(()=>organizations.id),tripId:text('trip_id').notNull().references(()=>trips.id),consignmentId:text('consignment_id').notNull().references(()=>consignments.id),snapshot:text('snapshot').notNull(),active:integer('active').notNull().default(1),
},t=>[uniqueIndex('trip_active_consignment').on(t.orgId,t.consignmentId).where(sql`active=1`),uniqueIndex('trip_consignment_once').on(t.tripId,t.consignmentId)]);
export const tripEvents = sqliteTable('trip_events', {
  id:text('id').primaryKey(),orgId:text('org_id').notNull().references(()=>organizations.id),tripId:text('trip_id').notNull().references(()=>trips.id),version:integer('version').notNull(),kind:text('kind').notNull(),
  allocationId:text('allocation_id').references(()=>tripAllocations.id),targetEventId:text('target_event_id'),eventAt:text('event_at').notNull(),reference:text('reference').notNull().default(''),note:text('note').notNull().default(''),payload:text('payload').notNull(),actor:text('actor').notNull(),recordedAt:text('recorded_at').notNull(),
},t=>[uniqueIndex('trip_event_version').on(t.orgId,t.tripId,t.version)]);

export const assetScopes=sqliteTable('asset_scopes',{
  assetId:text('asset_id').primaryKey().references(()=>assets.id),orgId:text('org_id').notNull().references(()=>organizations.id),purpose:text('purpose').notNull(),
});
export const tripDocuments=sqliteTable('trip_documents',{
  id:text('id').primaryKey(),orgId:text('org_id').notNull().references(()=>organizations.id),tripId:text('trip_id').notNull().references(()=>trips.id),allocationId:text('allocation_id').notNull().references(()=>tripAllocations.id),assetId:text('asset_id').notNull().references(()=>assets.id),
  sha256:text('sha256').notNull(),size:integer('size').notNull(),payload:text('payload').notNull(),actor:text('actor').notNull(),createdAt:text('created_at').notNull(),
},t=>[uniqueIndex('trip_document_asset').on(t.assetId),index('trip_document_allocation').on(t.orgId,t.tripId,t.allocationId)]);
export const tripDocumentReviews=sqliteTable('trip_document_reviews',{
  eventId:text('event_id').primaryKey().references(()=>tripEvents.id),documentId:text('document_id').notNull().references(()=>tripDocuments.id),orgId:text('org_id').notNull().references(()=>organizations.id),
});
export const tripStageDocuments=sqliteTable('trip_stage_documents',{
  id:text('id').primaryKey(),orgId:text('org_id').notNull().references(()=>organizations.id),tripId:text('trip_id').notNull().references(()=>trips.id),allocationId:text('allocation_id').references(()=>tripAllocations.id),assetId:text('asset_id').notNull().references(()=>assets.id),stage:text('stage').notNull(),
  tripVersion:integer('trip_version').notNull(),sha256:text('sha256').notNull(),size:integer('size').notNull(),payload:text('payload').notNull(),actor:text('actor').notNull(),createdAt:text('created_at').notNull(),
},t=>[
  uniqueIndex('trip_stage_document_asset').on(t.assetId),uniqueIndex('trip_stage_document_version').on(t.orgId,t.tripId,t.tripVersion),index('trip_stage_document_lookup').on(t.orgId,t.tripId,t.stage,t.allocationId),
  check('trip_stage_document_stage',sql`${t.stage} IN ('placement','loading','arrival')`),
  check('trip_stage_document_version_value',sql`typeof(${t.tripVersion})='integer' AND ${t.tripVersion}>0 AND ${t.tripVersion}<=9007199254740991`),
  check('trip_stage_document_size',sql`typeof(${t.size})='integer' AND ${t.size}>0 AND ${t.size}<=2097152`),
  check('trip_stage_document_hash',sql`length(${t.sha256})=64 AND ${t.sha256} NOT GLOB '*[^0-9a-f]*'`),
  check('trip_stage_document_payload',sql`json_valid(${t.payload}) AND json_type(${t.payload})='object'`),
]);
export const tripStageReviews=sqliteTable('trip_stage_reviews',{
  id:text('id').primaryKey(),orgId:text('org_id').notNull().references(()=>organizations.id),tripId:text('trip_id').notNull().references(()=>trips.id),documentId:text('document_id').notNull().references(()=>tripStageDocuments.id),
  kind:text('kind').notNull(),targetId:text('target_id'),tripVersion:integer('trip_version').notNull(),eventAt:text('event_at').notNull(),note:text('note').notNull(),payload:text('payload').notNull(),actor:text('actor').notNull(),actorRole:text('actor_role').notNull(),recordedAt:text('recorded_at').notNull(),
},t=>[
  uniqueIndex('trip_stage_review_version').on(t.orgId,t.tripId,t.tripVersion),uniqueIndex('trip_stage_review_correction').on(t.targetId).where(sql`kind='correction'`),index('trip_stage_review_document').on(t.orgId,t.tripId,t.documentId),
  check('trip_stage_review_kind',sql`${t.kind} IN ('accept','reject','correction')`),
  check('trip_stage_review_role',sql`${t.actorRole}='OWNER'`),
  check('trip_stage_review_version_value',sql`typeof(${t.tripVersion})='integer' AND ${t.tripVersion}>0 AND ${t.tripVersion}<=9007199254740991`),
  check('trip_stage_review_target',sql`(${t.kind}='correction' AND ${t.targetId} IS NOT NULL) OR (${t.kind}<>'correction' AND ${t.targetId} IS NULL)`),
  check('trip_stage_review_note',sql`length(${t.note})<=500 AND (${t.kind}='accept' OR length(trim(${t.note}))>0)`),
  check('trip_stage_review_payload',sql`json_valid(${t.payload}) AND json_type(${t.payload})='object'`),
]);
export const tripStageEventDependencies=sqliteTable('trip_stage_event_dependencies',{
  eventId:text('event_id').notNull().references(()=>tripEvents.id),prerequisiteEventId:text('prerequisite_event_id').notNull().references(()=>tripEvents.id),orgId:text('org_id').notNull().references(()=>organizations.id),tripId:text('trip_id').notNull().references(()=>trips.id),
},t=>[primaryKey({columns:[t.eventId,t.prerequisiteEventId]}),index('trip_stage_dependency_parent').on(t.orgId,t.tripId,t.prerequisiteEventId)]);
export const tripStageEvidenceUses=sqliteTable('trip_stage_evidence_uses',{
  eventId:text('event_id').primaryKey().references(()=>tripEvents.id),documentId:text('document_id').notNull().references(()=>tripStageDocuments.id),reviewId:text('review_id').notNull().references(()=>tripStageReviews.id),orgId:text('org_id').notNull().references(()=>organizations.id),tripId:text('trip_id').notNull().references(()=>trips.id),
},t=>[index('trip_stage_use_review').on(t.orgId,t.tripId,t.reviewId)]);
export const vehicleDocuments=sqliteTable('vehicle_documents',{
  id:text('id').primaryKey(),orgId:text('org_id').notNull().references(()=>organizations.id),vehicleId:text('vehicle_id').notNull().references(()=>tripVehicles.id),kind:text('kind').notNull(),
  number:text('number').notNull(),issuedOn:text('issued_on'),validUntil:text('valid_until'),sourceReference:text('source_reference').notNull(),assetId:text('asset_id').references(()=>assets.id),details:text('details').notNull().default('{}'),
  status:text('status').notNull().default('recorded'),version:integer('version').notNull().default(1),createdBy:text('created_by').notNull(),createdAt:text('created_at').notNull(),voidReason:text('void_reason').notNull().default(''),voidedAt:text('voided_at'),
},t=>[index('vehicle_document_lookup').on(t.orgId,t.vehicleId,t.kind)]);
export const vehicleDocumentReviews=sqliteTable('vehicle_document_reviews',{
  id:text('id').primaryKey(),orgId:text('org_id').notNull().references(()=>organizations.id),documentId:text('document_id').notNull().references(()=>vehicleDocuments.id),method:text('method').notNull(),checkedOn:text('checked_on').notNull(),reference:text('reference').notNull(),actor:text('actor').notNull(),createdAt:text('created_at').notNull(),
});
export const gpsConnections=sqliteTable('gps_connections',{
  id:text('id').primaryKey(),orgId:text('org_id').notNull().references(()=>organizations.id),provider:text('provider').notNull(),label:text('label').notNull(),authorizationReference:text('authorization_reference').notNull(),
  encryptedToken:text('encrypted_token'),status:text('status').notNull().default('unconfigured'),version:integer('version').notNull().default(1),
  lastAttemptAt:text('last_attempt_at'),lastSuccessAt:text('last_success_at'),lastError:text('last_error').notNull().default(''),leaseToken:text('lease_token'),leaseUntil:text('lease_until'),createdAt:text('created_at').notNull(),
});
export const gpsMappings=sqliteTable('gps_mappings',{
  id:text('id').primaryKey(),orgId:text('org_id').notNull().references(()=>organizations.id),connectionId:text('connection_id').notNull().references(()=>gpsConnections.id),vehicleId:text('vehicle_id').notNull().references(()=>tripVehicles.id),providerVehicleId:text('provider_vehicle_id').notNull(),createdAt:text('created_at').notNull(),
},t=>[uniqueIndex('gps_mapping_provider_vehicle').on(t.orgId,t.connectionId,t.providerVehicleId),uniqueIndex('gps_mapping_local_vehicle').on(t.orgId,t.connectionId,t.vehicleId)]);
export const gpsObservations=sqliteTable('gps_observations',{
  id:text('id').primaryKey(),orgId:text('org_id').notNull().references(()=>organizations.id),connectionId:text('connection_id').notNull().references(()=>gpsConnections.id),vehicleId:text('vehicle_id').notNull().references(()=>tripVehicles.id),providerVehicleId:text('provider_vehicle_id').notNull(),
  registration:text('registration').notNull(),observedAt:text('observed_at').notNull(),latitude:text('latitude').notNull(),longitude:text('longitude').notNull(),speed:text('speed'),speedObservedAt:text('speed_observed_at'),receivedAt:text('received_at').notNull(),payload:text('payload').notNull(),
},t=>[uniqueIndex('gps_fix_identity').on(t.orgId,t.connectionId,t.providerVehicleId,t.observedAt),index('gps_fix_vehicle').on(t.orgId,t.vehicleId,t.observedAt)]);
