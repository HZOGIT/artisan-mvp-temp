-- Custom SQL migration file, put your code below! --
ALTER TABLE "pa_outbox" DROP CONSTRAINT IF EXISTS "pa_outbox_factureId_factures_id_fk";
ALTER TABLE "pa_outbox" ADD CONSTRAINT "pa_outbox_factureId_factures_id_fk" FOREIGN KEY ("factureId") REFERENCES "public"."factures"("id") ON DELETE CASCADE ON UPDATE no action;