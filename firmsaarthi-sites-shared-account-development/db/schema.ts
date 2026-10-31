import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const accountFlows=sqliteTable('site_account_flows',{stateHash:text('state_hash').primaryKey(),browserHash:text('browser_hash').notNull(),expiresAt:text('expires_at').notNull()});
export const accountReviews=sqliteTable('site_account_reviews',{tokenHash:text('token_hash').primaryKey(),principal:text('principal').notNull(),expiresAt:text('expires_at').notNull()});

export const requests = sqliteTable('site_requests', {
  id: text('id').primaryKey(), tokenHash: text('token_hash').notNull(),
  business: text('business').notNull(), email: text('email').notNull(),
  slug: text('slug').notNull(), domainType: text('domain_type').notNull(),
  brief: text('brief').notNull(), status: text('status').notNull().default('submitted'),
  createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
  publishedAt: text('published_at'), trialEndsAt: text('trial_ends_at'), paidUntil: text('paid_until'),
  adminNote: text('admin_note').notNull().default(''), version: integer('version').notNull().default(0),
  ownerId: text('owner_id'),
  deliveryDueAt:text('delivery_due_at'),
  instantStarter:integer('instant_starter').notNull().default(0),
}, t => [uniqueIndex('site_slug_unique').on(t.slug)]);

export const assets = sqliteTable('site_assets', {
  id: text('id').primaryKey(), requestId: text('request_id').notNull().references(() => requests.id),
  objectKey: text('object_key').notNull(), type: text('type').notNull(), name: text('name').notNull(),
  size: integer('size').notNull(), kind: text('kind').notNull(), createdAt: text('created_at').notNull(),
});
export const events = sqliteTable('site_events', {
  id: text('id').primaryKey(), requestId: text('request_id').notNull().references(() => requests.id),
  status: text('status').notNull(), message: text('message').notNull(), createdAt: text('created_at').notNull(),
});
export const orders = sqliteTable('site_orders', {
  id: text('id').primaryKey(), requestId: text('request_id').notNull().references(() => requests.id),
  providerId: text('provider_id').unique(), paymentId: text('payment_id').unique(),
  status: text('status').notNull(), amount: integer('amount').notNull(),
  createdAt: text('created_at').notNull(), paidAt: text('paid_at'),
});
export const outbox = sqliteTable('site_outbox', {
  id: text('id').primaryKey(), requestId: text('request_id').notNull().references(() => requests.id),
  recipient: text('recipient').notNull(), subject: text('subject').notNull(), body: text('body').notNull(),
  status: text('status').notNull().default('pending'), attempts: integer('attempts').notNull().default(0),
  createdAt: text('created_at').notNull(), sentAt: text('sent_at'),
});
export const rateLimits = sqliteTable('site_rate_limits', {
  id: text('id').primaryKey(), count: integer('count').notNull().default(1), expiresAt: text('expires_at').notNull(),
});
export const users = sqliteTable('site_users', {
  id: text('id').primaryKey(), email: text('email').notNull().unique(), name: text('name').notNull(),
  passwordHash: text('password_hash'), googleSubject: text('google_subject').unique(), createdAt: text('created_at').notNull(),
});
export const sessions = sqliteTable('site_sessions', {
  tokenHash: text('token_hash').primaryKey(), userId: text('user_id').notNull().references(() => users.id), expiresAt: text('expires_at').notNull(),
});
export const emailCodes = sqliteTable('site_email_codes', {
  id: text('id').primaryKey(), email: text('email').notNull(), purpose: text('purpose').notNull(), codeHash: text('code_hash').notNull(),
  expiresAt: text('expires_at').notNull(), attempts: integer('attempts').notNull().default(0),
});
export const googleFlows = sqliteTable('site_google_flows', {
  stateHash: text('state_hash').primaryKey(), browserHash: text('browser_hash').notNull(), nonce: text('nonce').notNull(), verifier: text('verifier').notNull(),
  expiresAt: text('expires_at').notNull(), linkUser: text('link_user'),
  returnTo:text('return_to').notNull().default('/account'),
});
export const identityLinks=sqliteTable('site_identity_links',{
  tokenHash:text('token_hash').primaryKey(),email:text('email').notNull(),subject:text('subject').notNull(),expiresAt:text('expires_at').notNull(),
});
export const firmsaarthiLinks=sqliteTable('site_firmsaarthi_links',{transportUserId:text('transport_user_id').primaryKey(),userId:text('user_id').notNull().unique().references(()=>users.id),credentialVersion:text('credential_version').notNull()});
export const federatedSessions=sqliteTable('site_federated_sessions',{tokenHash:text('token_hash').primaryKey(),userId:text('user_id').notNull().references(()=>users.id),credentialVersion:text('credential_version').notNull(),sourceSessionHash:text('source_session_hash')});
