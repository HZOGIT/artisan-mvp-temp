import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  boolean,
  bigint,
  jsonb,
  unique,
  primaryKey,
} from "drizzle-orm/pg-core";

export const billingPaymentMethods = pgTable("billing_payment_methods", {
  id: serial("id").primaryKey(),
  artisan_id: integer("artisan_id").notNull(),
  stripe_customer_id: varchar("stripe_customer_id", { length: 255 }).notNull(),
  stripe_payment_method_id: varchar("stripe_payment_method_id", { length: 255 }).notNull().unique(),
  brand: varchar("brand", { length: 50 }),
  last4: varchar("last4", { length: 4 }),
  exp_month: integer("exp_month"),
  exp_year: integer("exp_year"),
  is_default: boolean("is_default").default(false).notNull(),
  consented_at: timestamp("consented_at").notNull(),
  revoked_at: timestamp("revoked_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type BillingPaymentMethod = typeof billingPaymentMethods.$inferSelect;
export type InsertBillingPaymentMethod = typeof billingPaymentMethods.$inferInsert;

export const billingSubscriptions = pgTable("billing_subscriptions", {
  id: serial("id").primaryKey(),
  artisan_id: integer("artisan_id").notNull().unique(),
  plan_id: varchar("plan_id", { length: 50 }).notNull(),
  billing_interval: varchar("billing_interval", { length: 10 }).default("monthly").notNull(),
  billing_mode: varchar("billing_mode", { length: 20 }).default("maison").notNull(),
  status: varchar("status", { length: 50 }).notNull(),
  current_period_start: timestamp("current_period_start"),
  current_period_end: timestamp("current_period_end"),
  cancel_at: timestamp("cancel_at"),
  canceled_at: timestamp("canceled_at"),
  trial_ends_at: timestamp("trial_ends_at"),
  payment_method_id: integer("payment_method_id").references(() => billingPaymentMethods.id, { onDelete: "restrict" }),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type BillingSubscription = typeof billingSubscriptions.$inferSelect;
export type InsertBillingSubscription = typeof billingSubscriptions.$inferInsert;

export const billingCycles = pgTable("billing_cycles", {
  id: serial("id").primaryKey(),
  subscription_id: integer("subscription_id").notNull().references(() => billingSubscriptions.id, { onDelete: "restrict" }),
  period_start: timestamp("period_start").notNull(),
  period_end: timestamp("period_end").notNull(),
  amount_cents: bigint("amount_cents", { mode: "number" }).notNull(),
  currency: varchar("currency", { length: 3 }).default("eur").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  charging_started_at: timestamp("charging_started_at"),
  attempt_count: integer("attempt_count").default(0).notNull(),
  next_retry_at: timestamp("next_retry_at"),
  paid_at: timestamp("paid_at"),
  failed_at: timestamp("failed_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => ({
  uniqPeriod: unique("uniq_cycle_per_period").on(t.subscription_id, t.period_start),
}));
export type BillingCycle = typeof billingCycles.$inferSelect;
export type InsertBillingCycle = typeof billingCycles.$inferInsert;

export const billingChargeAttempts = pgTable("billing_charge_attempts", {
  id: serial("id").primaryKey(),
  cycle_id: integer("cycle_id").notNull().references(() => billingCycles.id, { onDelete: "restrict" }),
  attempt_no: integer("attempt_no").notNull(),
  idempotency_key: varchar("idempotency_key", { length: 255 }).notNull().unique(),
  stripe_payment_intent_id: varchar("stripe_payment_intent_id", { length: 255 }),
  status: varchar("status", { length: 20 }).notNull().default("initiated"),
  failure_code: varchar("failure_code", { length: 100 }),
  failure_message: text("failure_message"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => ({
  uniqAttempt: unique("uniq_cycle_attempt_no").on(t.cycle_id, t.attempt_no),
}));
export type BillingChargeAttempt = typeof billingChargeAttempts.$inferSelect;
export type InsertBillingChargeAttempt = typeof billingChargeAttempts.$inferInsert;

export const billingInvoices = pgTable("billing_invoices", {
  id: serial("id").primaryKey(),
  artisan_id: integer("artisan_id").notNull(),
  number: varchar("number", { length: 30 }).unique(),
  stripe_invoice_id: varchar("stripe_invoice_id", { length: 255 }).unique(),
  stripe_invoice_number: varchar("stripe_invoice_number", { length: 100 }),
  type: varchar("type", { length: 30 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  subtotal_cents: bigint("subtotal_cents", { mode: "number" }).notNull(),
  tax_cents: bigint("tax_cents", { mode: "number" }).notNull().default(0),
  total_cents: bigint("total_cents", { mode: "number" }).notNull(),
  credit_amount_cents: bigint("credit_amount_cents", { mode: "number" }).notNull().default(0),
  refund_amount_cents: bigint("refund_amount_cents", { mode: "number" }).notNull().default(0),
  currency: varchar("currency", { length: 3 }).notNull().default("eur"),
  billing_cycle_id: integer("billing_cycle_id").unique().references(() => billingCycles.id, { onDelete: "restrict" }),
  original_invoice_id: integer("original_invoice_id"),
  stripe_payment_intent_id: varchar("stripe_payment_intent_id", { length: 255 }),
  pdf_url: text("pdf_url"),
  buyer_siren: varchar("buyer_siren", { length: 9 }),
  buyer_routing_id: varchar("buyer_routing_id", { length: 255 }),
  einvoice_format: varchar("einvoice_format", { length: 20 }),
  einvoice_status: varchar("einvoice_status", { length: 30 }),
  einvoice_pa_message_id: varchar("einvoice_pa_message_id", { length: 255 }),
  einvoice_hash: varchar("einvoice_hash", { length: 64 }),
  seller_name: varchar("seller_name", { length: 255 }),
  seller_address: text("seller_address"),
  seller_siret: varchar("seller_siret", { length: 14 }),
  seller_tva_intracom: varchar("seller_tva_intracom", { length: 20 }),
  buyer_name: varchar("buyer_name", { length: 255 }),
  buyer_address: text("buyer_address"),
  buyer_siret: varchar("buyer_siret", { length: 14 }),
  due_at: timestamp("due_at"),
  paid_at: timestamp("paid_at"),
  voided_at: timestamp("voided_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type BillingInvoice = typeof billingInvoices.$inferSelect;
export type InsertBillingInvoice = typeof billingInvoices.$inferInsert;

export const billingInvoiceLines = pgTable("billing_invoice_lines", {
  id: serial("id").primaryKey(),
  invoice_id: integer("invoice_id").notNull().references(() => billingInvoices.id, { onDelete: "restrict" }),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unit_amount_cents: bigint("unit_amount_cents", { mode: "number" }).notNull(),
  amount_cents: bigint("amount_cents", { mode: "number" }).notNull(),
  tax_rate_bps: integer("tax_rate_bps").notNull().default(0),
  tax_amount_cents: bigint("tax_amount_cents", { mode: "number" }).notNull().default(0),
  type: varchar("type", { length: 50 }).notNull(),
  metadata: jsonb("metadata"),
  sort_order: integer("sort_order").notNull().default(0),
  created_at: timestamp("created_at").defaultNow().notNull(),
});
export type BillingInvoiceLine = typeof billingInvoiceLines.$inferSelect;
export type InsertBillingInvoiceLine = typeof billingInvoiceLines.$inferInsert;

export const billingInvoiceSequences = pgTable("billing_invoice_sequences", {
  series: varchar("series", { length: 10 }).notNull(),
  year: integer("year").notNull(),
  next_val: integer("next_val").notNull().default(1),
}, (t) => ({
  pk: primaryKey({ columns: [t.series, t.year] }),
}));
export type BillingInvoiceSequence = typeof billingInvoiceSequences.$inferSelect;

export const billingWebhookEvents = pgTable("billing_webhook_events", {
  stripe_event_id: varchar("stripe_event_id", { length: 255 }).primaryKey(),
  type: varchar("type", { length: 100 }).notNull(),
  processed_at: timestamp("processed_at").defaultNow().notNull(),
  payload: jsonb("payload").notNull(),
});
export type BillingWebhookEvent = typeof billingWebhookEvents.$inferSelect;

export const billingEvents = pgTable("billing_events", {
  id: serial("id").primaryKey(),
  entity_type: varchar("entity_type", { length: 30 }).notNull(),
  entity_id: integer("entity_id").notNull(),
  event_type: varchar("event_type", { length: 50 }).notNull(),
  payload: jsonb("payload").notNull(),
  actor: varchar("actor", { length: 100 }),
  created_at: timestamp("created_at").defaultNow().notNull(),
});
export type BillingEvent = typeof billingEvents.$inferSelect;
export type InsertBillingEvent = typeof billingEvents.$inferInsert;

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  artisan_id: integer("artisan_id").notNull().unique(),
  stripe_customer_id: varchar("stripe_customer_id", { length: 255 }),
  stripe_subscription_id: varchar("stripe_subscription_id", { length: 255 }),
  stripe_price_id: varchar("stripe_price_id", { length: 255 }),
  plan: varchar("plan", { length: 50 }).default("trial").notNull(),
  status: varchar("status", { length: 50 }).default("trialing").notNull(),
  trial_ends_at: timestamp("trial_ends_at"),
  current_period_start: timestamp("current_period_start"),
  current_period_end: timestamp("current_period_end"),
  cancel_at_period_end: boolean("cancel_at_period_end").default(false).notNull(),
  max_users: integer("max_users").default(1).notNull(),
  max_devices_per_user: integer("max_devices_per_user").default(3).notNull(),
  max_concurrent_sessions: integer("max_concurrent_sessions").default(2).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;
