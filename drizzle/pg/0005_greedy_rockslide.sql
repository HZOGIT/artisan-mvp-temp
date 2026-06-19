CREATE TABLE "billing_charge_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"cycle_id" integer NOT NULL,
	"attempt_no" integer NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"stripe_payment_intent_id" varchar(255),
	"status" varchar(20) DEFAULT 'initiated' NOT NULL,
	"failure_code" varchar(100),
	"failure_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "billing_charge_attempts_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "uniq_cycle_attempt_no" UNIQUE("cycle_id","attempt_no")
);
--> statement-breakpoint
CREATE TABLE "billing_cycles" (
	"id" serial PRIMARY KEY NOT NULL,
	"subscription_id" integer NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'eur' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"charging_started_at" timestamp,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp,
	"paid_at" timestamp,
	"failed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uniq_cycle_per_period" UNIQUE("subscription_id","period_start")
);
--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" varchar(30) NOT NULL,
	"entity_id" integer NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"payload" jsonb NOT NULL,
	"actor" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_invoice_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_amount_cents" bigint NOT NULL,
	"amount_cents" bigint NOT NULL,
	"tax_rate_bps" integer DEFAULT 0 NOT NULL,
	"tax_amount_cents" bigint DEFAULT 0 NOT NULL,
	"type" varchar(50) NOT NULL,
	"metadata" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_invoice_sequences" (
	"series" varchar(10) NOT NULL,
	"year" integer NOT NULL,
	"next_val" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "billing_invoice_sequences_series_year_pk" PRIMARY KEY("series","year")
);
--> statement-breakpoint
CREATE TABLE "billing_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisan_id" integer NOT NULL,
	"number" varchar(30),
	"stripe_invoice_id" varchar(255),
	"stripe_invoice_number" varchar(100),
	"type" varchar(30) NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"subtotal_cents" bigint NOT NULL,
	"tax_cents" bigint DEFAULT 0 NOT NULL,
	"total_cents" bigint NOT NULL,
	"credit_amount_cents" bigint DEFAULT 0 NOT NULL,
	"refund_amount_cents" bigint DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'eur' NOT NULL,
	"billing_cycle_id" integer,
	"original_invoice_id" integer,
	"stripe_payment_intent_id" varchar(255),
	"pdf_url" text,
	"buyer_siren" varchar(9),
	"buyer_routing_id" varchar(255),
	"einvoice_format" varchar(20),
	"einvoice_status" varchar(30),
	"einvoice_pa_message_id" varchar(255),
	"einvoice_hash" varchar(64),
	"due_at" timestamp,
	"paid_at" timestamp,
	"voided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "billing_invoices_number_unique" UNIQUE("number"),
	CONSTRAINT "billing_invoices_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id")
);
--> statement-breakpoint
CREATE TABLE "billing_payment_methods" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisan_id" integer NOT NULL,
	"stripe_customer_id" varchar(255) NOT NULL,
	"stripe_payment_method_id" varchar(255) NOT NULL,
	"brand" varchar(50),
	"last4" varchar(4),
	"exp_month" integer,
	"exp_year" integer,
	"is_default" boolean DEFAULT false NOT NULL,
	"consented_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "billing_payment_methods_stripe_payment_method_id_unique" UNIQUE("stripe_payment_method_id")
);
--> statement-breakpoint
CREATE TABLE "billing_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisan_id" integer NOT NULL,
	"plan_id" varchar(50) NOT NULL,
	"billing_mode" varchar(20) DEFAULT 'maison' NOT NULL,
	"status" varchar(50) NOT NULL,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"cancel_at" timestamp,
	"canceled_at" timestamp,
	"trial_ends_at" timestamp,
	"payment_method_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "billing_subscriptions_artisan_id_unique" UNIQUE("artisan_id")
);
--> statement-breakpoint
CREATE TABLE "billing_webhook_events" (
	"stripe_event_id" varchar(255) PRIMARY KEY NOT NULL,
	"type" varchar(100) NOT NULL,
	"processed_at" timestamp DEFAULT now() NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_charge_attempts" ADD CONSTRAINT "billing_charge_attempts_cycle_id_billing_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."billing_cycles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_cycles" ADD CONSTRAINT "billing_cycles_subscription_id_billing_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."billing_subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoice_lines" ADD CONSTRAINT "billing_invoice_lines_invoice_id_billing_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."billing_invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_billing_cycle_id_billing_cycles_id_fk" FOREIGN KEY ("billing_cycle_id") REFERENCES "public"."billing_cycles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_payment_method_id_billing_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."billing_payment_methods"("id") ON DELETE restrict ON UPDATE no action;