import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { processConnectWebhook } from "./connect-webhook-use-cases";
import { ConnectArtisanWriterDrizzle } from "../infra/connect-artisan-writer-drizzle";
import { WebhookPaymentWriterDrizzle } from "../../subscription/infra/webhook-payment-writer-drizzle";
import { createDbClient } from "../../../shared/db";
import type { DbHandle } from "../../../shared/db";
import { artisans } from "../../../../../drizzle/schema.pg";
import { users } from "../../../../../drizzle/schema/users";
import type { StripePort, StripeWebhookEvent } from "../../../shared/ports/stripe";

/**
 * Test anti-régression OPE-934 : le handler processConnectWebhook doit persister charges_enabled=true
 * même lorsque l'event a un préfixe evt_test_ (mode test Stripe — tous les vrais events ont ce préfixe
 * en staging). Lecture de vérification via app_tenant (APP_DATABASE_URL) — anti false-green.
 */

const ownerDbUrl = process.env.DATABASE_URL;
const appDbUrl = process.env.APP_DATABASE_URL;

const ACCOUNT_ID = `acct_test_webhook_l2_${Date.now()}`;

function makeFakeStripe(event: StripeWebhookEvent): StripePort {
  return {
    constructEvent: async () => event,
    createCustomer: undefined as never,
    createInvoiceCheckout: undefined as never,
    retrieveCheckoutSession: undefined as never,
    createConnectAccount: undefined as never,
    createAccountLink: undefined as never,
    retrieveConnectAccount: undefined as never,
  };
}

describe.skipIf(!ownerDbUrl || !appDbUrl)("processConnectWebhook L2 — anti-régression OPE-934", () => {
  let ownerHandle: DbHandle;
  let appHandle: DbHandle;
  let testUserId: number;
  let testArtisanId: number;

  beforeAll(async () => {
    ownerHandle = createDbClient(ownerDbUrl!);
    appHandle = createDbClient(appDbUrl!);

    const [user] = await ownerHandle.db.insert(users).values({
      email: `webhook-l2-${Date.now()}@test.local`,
      role: "artisan",
    }).returning({ id: users.id });
    testUserId = user!.id;

    const [artisan] = await ownerHandle.db.insert(artisans).values({
      userId: testUserId,
      stripeConnectAccountId: ACCOUNT_ID,
      stripeConnectStatus: "pending",
      stripeConnectChargesEnabled: false,
      stripeConnectPayoutsEnabled: false,
      stripeConnectDetailsSubmitted: false,
    }).returning({ id: artisans.id });
    testArtisanId = artisan!.id;
  });

  afterAll(async () => {
    await ownerHandle.db.delete(artisans).where(eq(artisans.id, testArtisanId));
    await ownerHandle.db.delete(users).where(eq(users.id, testUserId));
    await ownerHandle.close();
    await appHandle.close();
  });

  it("account.updated avec evt_test_* persiste charges_enabled=true via owner pool (lecture app_tenant)", async () => {
    const event: StripeWebhookEvent = {
      id: "evt_test_ope934_anti_regression",
      type: "account.updated",
      account: ACCOUNT_ID,
      data: { object: { id: ACCOUNT_ID, charges_enabled: true, payouts_enabled: true, details_submitted: true } },
    };
    const writer = new ConnectArtisanWriterDrizzle(ownerHandle.db);

    const result = await processConnectWebhook(
      { stripe: makeFakeStripe(event), writer, webhookSecret: "whsec_test" },
      { rawBody: Buffer.from("{}"), signature: "valid" },
    );

    expect(result.http).toBe(200);

    /* Lecture via app_tenant sans contexte tenant — anti false-green */
    const [row] = await appHandle.db
      .select({
        status: artisans.stripeConnectStatus,
        chargesEnabled: artisans.stripeConnectChargesEnabled,
        payoutsEnabled: artisans.stripeConnectPayoutsEnabled,
      })
      .from(artisans)
      .where(eq(artisans.id, testArtisanId))
      .limit(1);

    expect(row?.status).toBe("active");
    expect(row?.chargesEnabled).toBe(true);
    expect(row?.payoutsEnabled).toBe(true);
  });

  it("signature invalide → 400 (pas de bypass 2xx silencieux)", async () => {
    const stripe: StripePort = {
      constructEvent: async () => { throw new Error("Invalid signature"); },
      createCustomer: undefined as never,
      createInvoiceCheckout: undefined as never,
      retrieveCheckoutSession: undefined as never,
      createConnectAccount: undefined as never,
      createAccountLink: undefined as never,
      retrieveConnectAccount: undefined as never,
    };
    const writer = new ConnectArtisanWriterDrizzle(ownerHandle.db);
    const result = await processConnectWebhook(
      { stripe, writer, webhookSecret: "whsec_test" },
      { rawBody: Buffer.from("{}"), signature: "bad-sig" },
    );
    expect(result.http).toBe(400);
  });
});

/**
 * L2 anti-régression OPE-970 : checkout.session.completed (direct charge Connect) → facture payée.
 * Reproduit FAC-23 : Stripe OK mais facture restait impayée (expiration poller écrasait la réconciliation).
 * Vérifie que processConnectWebhook avec paymentWriter marque la facture payée + émet facture.payee.
 */
const UID_970 = 9982001;
const TOKEN_970 = `tok-connect-l2-ope970-${Date.now()}`;

describe.skipIf(!ownerDbUrl || !appDbUrl)("processConnectWebhook L2 — checkout.session.completed → facture payée (OPE-970)", () => {
  const admin = new Pool({ connectionString: ownerDbUrl! });
  let ownerHandle970: DbHandle;
  const appClient = createDbClient(appDbUrl!);
  let artisanId = 0;
  let factureId = 0;
  let paiementId = 0;

  const cleanup = async () => {
    await admin.query(`DELETE FROM event_outbox WHERE "artisanId" IN (SELECT id FROM artisans WHERE "userId"=$1)`, [UID_970]);
    await admin.query(`DELETE FROM notifications WHERE "artisanId" IN (SELECT id FROM artisans WHERE "userId"=$1)`, [UID_970]);
    await admin.query(`DELETE FROM paiements_stripe WHERE "artisanId" IN (SELECT id FROM artisans WHERE "userId"=$1)`, [UID_970]);
    await admin.query(`DELETE FROM factures WHERE "artisanId" IN (SELECT id FROM artisans WHERE "userId"=$1)`, [UID_970]);
    await admin.query(`DELETE FROM clients WHERE "artisanId" IN (SELECT id FROM artisans WHERE "userId"=$1)`, [UID_970]);
    await admin.query(`DELETE FROM artisans WHERE "userId"=$1`, [UID_970]);
    await admin.query(`DELETE FROM users WHERE id=$1`, [UID_970]);
  };

  beforeAll(async () => {
    ownerHandle970 = createDbClient(ownerDbUrl!);
    await cleanup();
    await admin.query(`INSERT INTO users (id, email, role) VALUES ($1, $2, 'artisan')`, [UID_970, `connect-l2-ope970-${UID_970}@test.local`]);
    artisanId = (await admin.query(`INSERT INTO artisans ("userId") VALUES ($1) RETURNING id`, [UID_970])).rows[0].id;
    const clientId = (await admin.query(`INSERT INTO clients ("artisanId", nom, prenom) VALUES ($1, 'Martin', 'Paul') RETURNING id`, [artisanId])).rows[0].id;
    factureId = (await admin.query(`INSERT INTO factures ("artisanId", "clientId", numero, statut, "totalTTC") VALUES ($1, $2, 'FAC-CONNECT-L2', 'envoyee', '350.00') RETURNING id`, [artisanId, clientId])).rows[0].id;
    paiementId = (await admin.query(
      `INSERT INTO paiements_stripe ("artisanId", "factureId", "tokenPaiement", statut, montant, "stripeSessionId") VALUES ($1, $2, $3, 'en_attente', '350.00', 'cs_connect_l2_ope970') RETURNING id`,
      [artisanId, factureId, TOKEN_970],
    )).rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await appClient.close();
    await ownerHandle970.close();
    await admin.end();
  });

  it("checkout.session.completed Connect → facture payée + paiement payee + facture.payee dans outbox", async () => {
    const session = {
      payment_intent: "pi_connect_l2_ope970",
      metadata: { token_paiement: TOKEN_970, facture_id: String(factureId) },
    };
    const event: StripeWebhookEvent = {
      id: "evt_connect_l2_ope970",
      type: "checkout.session.completed",
      account: "acct_waidev_test",
      data: { object: session },
    };

    const connectWriter = new ConnectArtisanWriterDrizzle(ownerHandle970.db);
    const paymentWriter = new WebhookPaymentWriterDrizzle(appClient.db);

    const result = await processConnectWebhook(
      {
        stripe: makeFakeStripe(event),
        writer: connectWriter,
        paymentWriter,
        webhookSecret: "whsec_test",
      },
      { rawBody: Buffer.from("{}"), signature: "valid" },
    );

    expect(result.http).toBe(200);

    const facRow = (await admin.query(`SELECT statut, "montantPaye" FROM factures WHERE id=$1`, [factureId])).rows[0];
    expect(facRow.statut).toBe("payee");
    expect(facRow.montantPaye).toBe("350.00");

    const paiRow = (await admin.query(`SELECT statut, "stripePaymentIntentId" FROM paiements_stripe WHERE id=$1`, [paiementId])).rows[0];
    expect(paiRow.statut).toBe("payee");
    expect(paiRow.stripePaymentIntentId).toBe("pi_connect_l2_ope970");

    const outboxRows = (await admin.query(
      `SELECT action FROM event_outbox WHERE "artisanId"=$1 AND action='facture.payee' ORDER BY id DESC LIMIT 1`,
      [artisanId],
    )).rows;
    expect(outboxRows).toHaveLength(1);
  });
});
