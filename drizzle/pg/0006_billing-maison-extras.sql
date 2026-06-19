-- Custom SQL migration file, put your code below! --
-- billing-maison-extras : tout ce que drizzle-kit generate ne peut pas auto-produire.
-- (partial unique indexes, CHECK constraints, self-ref FK, index WHERE)

-- ── Partial unique index : une seule carte "is_default" par artisan (P2-2) ──
CREATE UNIQUE INDEX "uniq_default_pm_per_artisan"
  ON "billing_payment_methods" ("artisan_id")
  WHERE "is_default" = true;

-- ── Index de lecture courants ────────────────────────────────────────────────
CREATE INDEX "idx_pm_artisan"
  ON "billing_payment_methods" ("artisan_id");

CREATE INDEX "idx_subs_artisan_status"
  ON "billing_subscriptions" ("artisan_id", "status");

CREATE INDEX "idx_cycles_due"
  ON "billing_cycles" ("status", "next_retry_at")
  WHERE "status" IN ('pending', 'failed', 'requires_action');

CREATE INDEX "idx_cycles_charging"
  ON "billing_cycles" ("charging_started_at")
  WHERE "status" = 'charging';

CREATE INDEX "idx_cycles_subscription"
  ON "billing_cycles" ("subscription_id", "period_start");

CREATE INDEX "idx_attempts_pi"
  ON "billing_charge_attempts" ("stripe_payment_intent_id")
  WHERE "stripe_payment_intent_id" IS NOT NULL;

CREATE INDEX "idx_inv_artisan_status"
  ON "billing_invoices" ("artisan_id", "status");

CREATE INDEX "idx_inv_cycle"
  ON "billing_invoices" ("billing_cycle_id")
  WHERE "billing_cycle_id" IS NOT NULL;

CREATE INDEX "idx_lines_invoice"
  ON "billing_invoice_lines" ("invoice_id");

CREATE INDEX "idx_billing_events_entity"
  ON "billing_events" ("entity_type", "entity_id", "created_at");

CREATE INDEX "idx_billing_events_time"
  ON "billing_events" ("created_at");

-- ── CHECK constraints ────────────────────────────────────────────────────────
ALTER TABLE "billing_subscriptions"
  ADD CONSTRAINT "chk_sub_status"
    CHECK ("status" IN ('trialing', 'active', 'past_due', 'canceled')),
  ADD CONSTRAINT "chk_pm_required"
    CHECK ("status" = 'trialing' OR "payment_method_id" IS NOT NULL);

ALTER TABLE "billing_cycles"
  ADD CONSTRAINT "chk_cycle_status"
    CHECK ("status" IN ('pending', 'charging', 'requires_action', 'processing', 'paid', 'failed', 'skipped'));

ALTER TABLE "billing_charge_attempts"
  ADD CONSTRAINT "chk_attempt_status"
    CHECK ("status" IN ('initiated', 'succeeded', 'failed', 'requires_action', 'processing'));

ALTER TABLE "billing_invoices"
  ADD CONSTRAINT "chk_invoice_type"
    CHECK ("type" IN ('subscription', 'one_time', 'credit_note')),
  ADD CONSTRAINT "chk_invoice_status"
    CHECK ("status" IN ('draft', 'open', 'paid', 'void')),
  ADD CONSTRAINT "chk_number_finalized"
    CHECK ("status" = 'draft' OR "number" IS NOT NULL),
  ADD CONSTRAINT "chk_no_void_paid"
    CHECK (NOT ("status" = 'void' AND "paid_at" IS NOT NULL)),
  ADD CONSTRAINT "chk_credit_note_ref"
    CHECK ("type" != 'credit_note' OR "original_invoice_id" IS NOT NULL);

ALTER TABLE "billing_invoice_lines"
  ADD CONSTRAINT "chk_line_type"
    CHECK ("type" IN ('subscription', 'credit_pack', 'add_on', 'usage', 'discount', 'credit_note'));

-- ── Self-ref FK (billing_invoices → billing_invoices pour avoir credit_note) ──
-- Déclarée en ALTER TABLE car Drizzle ne supporte pas les self-ref inline sans AnyPgColumn.
ALTER TABLE "billing_invoices"
  ADD CONSTRAINT "fk_invoice_original"
  FOREIGN KEY ("original_invoice_id") REFERENCES "billing_invoices"("id") ON DELETE RESTRICT;

-- ── Révoquer DELETE/UPDATE sur billing_events (journal immuable — art. L123-22) ──
-- À exécuter en tant que superuser ou owner, séparément du rôle app_tenant.
-- REVOKE UPDATE, DELETE ON "billing_events" FROM app_tenant;
