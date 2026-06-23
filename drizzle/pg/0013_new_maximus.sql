CREATE TABLE "llm_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisan_id" integer NOT NULL,
	"user_id" integer,
	"use_case" varchar(80) NOT NULL,
	"model" varchar(80) NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"text_input_tokens" integer DEFAULT 0 NOT NULL,
	"audio_input_tokens" integer DEFAULT 0 NOT NULL,
	"image_input_tokens" integer DEFAULT 0 NOT NULL,
	"video_input_tokens" integer DEFAULT 0 NOT NULL,
	"cached_tokens" integer DEFAULT 0 NOT NULL,
	"tool_use_tokens" integer DEFAULT 0 NOT NULL,
	"response_tokens" integer DEFAULT 0 NOT NULL,
	"text_output_tokens" integer DEFAULT 0 NOT NULL,
	"audio_output_tokens" integer DEFAULT 0 NOT NULL,
	"thinking_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"traffic_type" varchar(30),
	"duration_ms" integer NOT NULL,
	"finish_reason" varchar(20) NOT NULL,
	"input_payload" text,
	"output_payload" text,
	"message_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "llm_usage" ADD CONSTRAINT "llm_usage_artisan_id_artisans_id_fk" FOREIGN KEY ("artisan_id") REFERENCES "public"."artisans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_usage" ADD CONSTRAINT "llm_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_usage" ADD CONSTRAINT "llm_usage_message_id_ai_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."ai_messages"("id") ON DELETE no action ON UPDATE no action;