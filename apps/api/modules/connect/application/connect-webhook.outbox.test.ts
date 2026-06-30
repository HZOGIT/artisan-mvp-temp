import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, and } from "drizzle-orm";
import { processConnectWebhook } from "./connect-webhook-use-cases";
import { ConnectArtisanWriterDrizzle } from "../infra/connect-artisan-writer-drizzle";
import { createDbClient } from "../../../shared/db";
import type { DbHandle } from "../../../shared/db";
import { artisans, eventOutbox } from "../../../../../drizzle/schema.pg";
import { users } from "../../../../../drizzle/schema/users";
import type { StripePort, StripeWebhookEvent } from "../../../shared/ports/stripe";

/**
 * Test atomicité L2 — OPE-938.
 * Vérifie que account.updated et account.application.deauthorized co-écrivent
 * un event dans event_outbox dans la MÊME transaction que la mise à jour du statut.
 * Doit ÉCHOUER sans la modification de ConnectArtisanWriterDrizzle et PASSER après.
 */

const ownerDbUrl = process.env.DATABASE_URL;
const appDbUrl = process.env.APP_DATABASE_URL;

const ACCOUNT_ID = `acct_test_outbox_${Date.now()}`;

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

describe.skipIf(!ownerDbUrl || !appDbUrl)("ConnectWebhook outbox atomicité L2 — OPE-938", () => {
  let ownerHandle: DbHandle;
  let testUserId: number;
  let testArtisanId: number;

  beforeAll(async () => {
    ownerHandle = createDbClient(ownerDbUrl!);

    const [user] = await ownerHandle.db.insert(users).values({
      email: `outbox-test-${Date.now()}@test.local`,
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
    await ownerHandle.db.delete(eventOutbox).where(eq(eventOutbox.artisanId, testArtisanId));
    await ownerHandle.db.delete(artisans).where(eq(artisans.id, testArtisanId));
    await ownerHandle.db.delete(users).where(eq(users.id, testUserId));
    await ownerHandle.close();
  });

  it("account.updated co-écrit compte_connecte.maj dans event_outbox (même tx que maj statut)", async () => {
    const event: StripeWebhookEvent = {
      id: "evt_test_outbox_updated",
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

    const rows = await ownerHandle.db
      .select({ id: eventOutbox.id, action: eventOutbox.action, entityType: eventOutbox.entityType })
      .from(eventOutbox)
      .where(and(eq(eventOutbox.artisanId, testArtisanId), eq(eventOutbox.action, "compte_connecte.maj")));

    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]?.entityType).toBe("compte_connecte");
  });

  it("account.application.deauthorized co-écrit compte_connecte.deconnecte dans event_outbox (même tx que reset statut)", async () => {
    const event: StripeWebhookEvent = {
      id: "evt_test_outbox_deauth",
      type: "account.application.deauthorized",
      account: ACCOUNT_ID,
      data: { object: {} },
    };
    const writer = new ConnectArtisanWriterDrizzle(ownerHandle.db);

    const result = await processConnectWebhook(
      { stripe: makeFakeStripe(event), writer, webhookSecret: "whsec_test" },
      { rawBody: Buffer.from("{}"), signature: "valid" },
    );

    expect(result.http).toBe(200);

    const rows = await ownerHandle.db
      .select({ id: eventOutbox.id, action: eventOutbox.action, entityType: eventOutbox.entityType })
      .from(eventOutbox)
      .where(and(eq(eventOutbox.artisanId, testArtisanId), eq(eventOutbox.action, "compte_connecte.deconnecte")));

    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]?.entityType).toBe("compte_connecte");
  });
});
