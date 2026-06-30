import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../db";
import { PortalPaymentWriterDrizzle } from "../../modules/paiement/infra/portal-payment-writer-drizzle";
import { FakeStripePort } from "../ports/stripe-adapter";

/**
 * L2 anti-régression OPE-954 : expiration reconciler.
 * - Le scan cross-tenant DOIT passer par le pool OWNER (DATABASE_URL, bypassrls).
 *   Avec app_tenant sans SET app.tenant → 0 lignes (FORCE RLS) → faux-vert silencieux.
 * - L'expiration DOIT utiliser withTenant (app_tenant + artisanId) : atomique update+outbox.
 * - Test exécuté sous APP_DATABASE_URL (anti false-green owner-bypass).
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

    const status = await stripe.retrieveCheckoutSession("cs_expire_l2_test", undefined);
    expect(status?.sessionStatus).not.toBe("open");

    await writer.expirePaiement({ artisanId: TEST_ARTISAN, userId: 0 }, paiementId);

    const { rows: pRows } = await owner.query('SELECT statut FROM paiements_stripe WHERE id = $1', [paiementId]);
    expect(pRows[0].statut).toBe("expire");

    const { rows: oRows } = await owner.query(
      `SELECT action FROM event_outbox WHERE "artisanId" = $1 AND "entityId" = $2`,
      [TEST_ARTISAN, paiementId],
    );
    expect(oRows.some((r: { action: string }) => r.action === "paiement.expire")).toBe(true);
  });

  it("session OPEN → skip (ne pas expirer)", async () => {
    await owner.query('INSERT INTO paiements_stripe ("artisanId", "factureId", "stripeSessionId", "tokenPaiement", statut, montant) VALUES ($1, 0, $2, $3, $4, $5)', [TEST_ARTISAN, "cs_open_l2", "tok_open_l2", "en_attente", "0.00"]);
    const { rows } = await owner.query('SELECT id FROM paiements_stripe WHERE "stripeSessionId" = $1', ["cs_open_l2"]);
    const openId = rows[0].id;

    stripe.sessionStatuses.set("cs_open_l2", { paymentStatus: "unpaid", paymentIntentId: null, sessionStatus: "open" });
    const status = await stripe.retrieveCheckoutSession("cs_open_l2", undefined);
    expect(status?.sessionStatus).toBe("open");

    const { rows: before } = await owner.query('SELECT statut FROM paiements_stripe WHERE id = $1', [openId]);
    expect(before[0].statut).toBe("en_attente");
  });
});
