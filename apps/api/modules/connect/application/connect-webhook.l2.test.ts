import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { processConnectWebhook } from "./connect-webhook-use-cases";
import { ConnectArtisanWriterDrizzle } from "../infra/connect-artisan-writer-drizzle";
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
