CREATE TABLE "message_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" varchar(100) NOT NULL,
	"message_index" integer NOT NULL,
	"file_id" integer NOT NULL,
	"artisan_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "message_files" ADD CONSTRAINT "message_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_files" ADD CONSTRAINT "message_files_artisan_id_artisans_id_fk" FOREIGN KEY ("artisan_id") REFERENCES "public"."artisans"("id") ON DELETE no action ON UPDATE no action;