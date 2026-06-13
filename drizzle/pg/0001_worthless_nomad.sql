CREATE TABLE "active_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"artisan_id" integer NOT NULL,
	"session_token" varchar(200) NOT NULL,
	"device_fingerprint" varchar(255),
	"ip" varchar(64),
	"expires_at" timestamp NOT NULL,
	"last_active_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_user_token" UNIQUE("user_id","session_token")
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"artisan_id" integer NOT NULL,
	"device_fingerprint" varchar(255) NOT NULL,
	"device_type" varchar(50),
	"browser" varchar(100),
	"os" varchar(100),
	"last_ip" varchar(64),
	"last_active_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "devices_user_fingerprint" UNIQUE("user_id","device_fingerprint")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisan_id" integer NOT NULL,
	"stripe_customer_id" varchar(255),
	"stripe_subscription_id" varchar(255),
	"stripe_price_id" varchar(255),
	"plan" varchar(50) DEFAULT 'trial' NOT NULL,
	"status" varchar(50) DEFAULT 'trialing' NOT NULL,
	"trial_ends_at" timestamp,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"max_users" integer DEFAULT 1 NOT NULL,
	"max_devices_per_user" integer DEFAULT 3 NOT NULL,
	"max_concurrent_sessions" integer DEFAULT 2 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_artisan_id_unique" UNIQUE("artisan_id")
);
