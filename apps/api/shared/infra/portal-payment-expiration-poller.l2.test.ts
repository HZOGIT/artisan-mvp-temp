import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../db";
import { PortalPaymentWriterDrizzle } from "../../modules/paiement/infra/portal-payment-writer-drizzle";
import { FakeStripePort } from "../ports/stripe-adapter";
import { expirePaymentIfNeeded } from "./portal-payment-expiration-poller";
import type { PendingSession } from "./portal-payment-expiration-poller";

/**
 * L2 anti-régression OPE-954 : expiration reconciler.
 * - Le scan cross-tenant DOIT passer par le pool OWNER (DATABASE_URL, bypassrls).
 *   Avec app_tenant sans SET app.tenant → 0 lignes (FORCE RLS) → faux-vert silencieux.
 * - L'expiration DOIT utiliser withTenant (app_tenant + artisanId) : atomique update+outbox.
 * - Test exécuté sous APP_DATABASE_URL (anti false-green owner-bypass).
 * - OPE-970 : session "complete" (= paiement réussi) ne doit PAS être expirée.
 */
const OWNER_URL = process.env.DATABASE_URL;
const APP_URL = process.env.APP_DATABASE_URL;

const TEST_ARTISAN = 997002;

describe.skipIf(!OWNER_URL || !APP_URL)("portal-payment-expiration-poller — L2 RLS + atomicité", () => {
  const owner = new Pool({ connectionString: OWNER_URL! });
  const appClient = createDbClient(APP_URL!);
  const writer = new PortalPaymentWriterDrizzle(appClient.db);
  const stripe = new FakeStripePort();
  let paiementId = 0;

  const cleanup = async () => {
    await owner.query('DELETE FROM paiements_stripe WHERE "artisanId" = $1', [TEST_ARTISAN]);
    await owner.query('DELETE FROM event_outbox WHERE "artisanId" = $1', [TEST_ARTISAN]);
    await owner.query('DELETE FROM artisans WHERE id = $1', [TEST_ARTISAN]).catch(() => {});
  };

  beforeAll(async () => {
    await cleanup();
    await owner.query('INSERT INTO artisans (id, "userId", "nomEntreprise") VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING', [TEST_ARTISAN, TEST_ARTISAN, "Test Expiration"]);
    const { rows } = await owner.query(
      `INSERT INTO paiements_stripe ("artisanId", "factureId", "stripeSessionId", "tokenPaiement", statut, montant)
       VALUES ($1, 0, 'cs_expire_l2_test', 'tok_expire_l2', 'en_attente', '0.00') RETURNING id`,
      [TEST_ARTISAN],
    );
    paiementId = rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await appClient.close();
    await owner.end();
  });

  it("app_tenant sans SET app.tenant voit 0 ligne en_attente (FORCE RLS — discovery doit passer par owner)", async () => {
    const { rows } = await owner.query(
      'SELECT id FROM paiements_stripe WHERE statut = $1 AND "artisanId" = $2',
      ["en_attente", TEST_ARTISAN],
    );
    expect(rows.some((r: { id: number }) => r.id === paiementId)).toBe(true);

    const appPool = new Pool({ connectionString: APP_URL! });
    const { rows: appRows } = await appPool.query(
      'SELECT id FROM paiements_stripe WHERE statut = $1 AND "artisanId" = $2',
      ["en_attente", TEST_ARTISAN],
    );
    expect(appRows.length).toBe(0);
    await appPool.end();
  });

  it("session Stripe EXPIRÉE → expirePaiement marque en_attente→expire + insère outbox atomiquement", async () => {
    stripe.sessionStatuses.set("cs_expire_l2_test", { paymentStatus: "unpaid", paymentIntentId: null, sessionStatus: "expired" });

    const row: PendingSession = { id: paiementId, artisanId: TEST_ARTISAN, stripeSessionId: "cs_expire_l2_test", stripeConnectAccountId: null };
    const outcome = await expirePaymentIfNeeded(row, stripe, writer);
    expect(outcome).toBe("expired");

    const { rows: pRows } = await owner.query('SELECT statut FROM paiements_stripe WHERE id = $1', [paiementId]);
    expect(pRows[0].statut).toBe("expire");

    const { rows: oRows } = await owner.query(
      `SELECT action FROM event_outbox WHERE "artisanId" = $1 AND "entityId" = $2`,
      [TEST_ARTISAN, paiementId],
    );
    expect(oRows.some((r: { action: string }) => r.action === "paiement.expire")).toBe(true);
  });

  it("session OPEN → outcome skipped-open (ne pas expirer)", async () => {
    const { rows: ins } = await owner.query<{ id: number }>(
      'INSERT INTO paiements_stripe ("artisanId", "factureId", "stripeSessionId", "tokenPaiement", statut, montant) VALUES ($1, 1, $2, $3, $4, $5) RETURNING id',
      [TEST_ARTISAN, "cs_open_l2", "tok_open_l2", "en_attente", "0.00"],
    );
    const openId = ins[0].id;

    stripe.sessionStatuses.set("cs_open_l2", { paymentStatus: "unpaid", paymentIntentId: null, sessionStatus: "open" });
    const row: PendingSession = { id: openId, artisanId: TEST_ARTISAN, stripeSessionId: "cs_open_l2", stripeConnectAccountId: null };
    const outcome = await expirePaymentIfNeeded(row, stripe, writer);
    expect(outcome).toBe("skipped-open");

    const { rows: after } = await owner.query('SELECT statut FROM paiements_stripe WHERE id = $1', [openId]);
    expect(after[0].statut).toBe("en_attente");
  });

  it("session COMPLETE (paiement réussi) → outcome skipped-complete, statut inchangé — anti-régression OPE-970", async () => {
    const { rows: ins } = await owner.query<{ id: number }>(
      'INSERT INTO paiements_stripe ("artisanId", "factureId", "stripeSessionId", "tokenPaiement", statut, montant) VALUES ($1, 2, $2, $3, $4, $5) RETURNING id',
      [TEST_ARTISAN, "cs_complete_l2", "tok_complete_l2", "en_attente", "0.00"],
    );
    const completeId = ins[0].id;

    stripe.sessionStatuses.set("cs_complete_l2", { paymentStatus: "paid", paymentIntentId: "pi_paid_l2", sessionStatus: "complete" });
    const row: PendingSession = { id: completeId, artisanId: TEST_ARTISAN, stripeSessionId: "cs_complete_l2", stripeConnectAccountId: null };
    const outcome = await expirePaymentIfNeeded(row, stripe, writer);
    expect(outcome).toBe("skipped-complete");

    const { rows: after } = await owner.query('SELECT statut FROM paiements_stripe WHERE id = $1', [completeId]);
    expect(after[0].statut).toBe("en_attente");
  });
});
