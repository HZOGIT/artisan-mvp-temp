CREATE INDEX IF NOT EXISTS "idx_event_outbox_created" ON "event_outbox" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_emails_log_artisan" ON "emails_log" USING btree ("artisanId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_paiements_stripe_artisan" ON "paiements_stripe" USING btree ("artisanId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_paiements_stripe_facture" ON "paiements_stripe" USING btree ("factureId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_paiements_stripe_statut" ON "paiements_stripe" USING btree ("statut") WHERE "paiements_stripe"."statut" = 'en_attente';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reglements_artisan" ON "reglements" USING btree ("artisanId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_relances_devis_artisan" ON "relances_devis" USING btree ("artisanId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_relances_devis_devis" ON "relances_devis" USING btree ("devisId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_devis_options_devis" ON "devis_options" USING btree ("devisId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_interventions_tech_intervention" ON "interventions_techniciens" USING btree ("interventionId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_depenses_artisan" ON "depenses" USING btree ("artisan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ecritures_artisan" ON "ecritures_comptables" USING btree ("artisanId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transactions_artisan" ON "transactions_bancaires" USING btree ("artisan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conges_artisan" ON "conges" USING btree ("artisanId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vehicules_artisan" ON "vehicules" USING btree ("artisanId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_activites_artisan" ON "activites" USING btree ("artisanId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_mouvements_stock_stock" ON "mouvements_stock" USING btree ("stockId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notifications_artisan" ON "notifications" USING btree ("artisanId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notifications_artisan_unread" ON "notifications" USING btree ("artisanId","lu","archived") WHERE "notifications"."lu" = false AND "notifications"."archived" = false;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stocks_artisan" ON "stocks" USING btree ("artisanId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pa_outbox_pending" ON "pa_outbox" USING btree ("statut","tentatives") WHERE "pa_outbox"."statut" IN ('pending', 'failed');
