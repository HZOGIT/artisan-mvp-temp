ALTER TABLE "signatures_devis" ADD COLUMN "artisanId" integer;--> statement-breakpoint
UPDATE public.signatures_devis sd SET "artisanId" = d."artisanId" FROM public.devis d WHERE d.id = sd."devisId";--> statement-breakpoint
DELETE FROM public.signatures_devis WHERE "artisanId" IS NULL;--> statement-breakpoint
ALTER TABLE public.signatures_devis ADD CONSTRAINT "signatures_devis_artisanid_notnull" CHECK ("artisanId" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE public.signatures_devis VALIDATE CONSTRAINT "signatures_devis_artisanid_notnull";--> statement-breakpoint
ALTER TABLE "signatures_devis" ALTER COLUMN "artisanId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE public.signatures_devis DROP CONSTRAINT "signatures_devis_artisanid_notnull";--> statement-breakpoint
CREATE INDEX "idx_signatures_devis_artisan" ON "signatures_devis" USING btree ("artisanId");--> statement-breakpoint
ALTER TABLE public.signatures_devis ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE ONLY public.signatures_devis FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.signatures_devis USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));--> statement-breakpoint
CREATE POLICY public_token_select ON public.signatures_devis FOR SELECT USING (((token)::text = NULLIF(current_setting('app.public_token'::text, true), ''::text)));
