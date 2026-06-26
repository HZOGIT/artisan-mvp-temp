CREATE TABLE "files" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisan_id" integer,
	"storage_key" varchar(500) NOT NULL,
	"filename" varchar(255),
	"mime_type" varchar(100) NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"purpose" varchar(50) NOT NULL,
	"bucket" varchar(100) NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "files_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_artisan_id_artisans_id_fk" FOREIGN KEY ("artisan_id") REFERENCES "public"."artisans"("id") ON DELETE no action ON UPDATE no action;