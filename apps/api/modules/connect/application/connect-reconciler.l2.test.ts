import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { runConnectReconciler } from "./connect-reconciler";
import { createDbClient } from "../../../shared/db";
import type { DbHandle } from "../../../shared/db";
import { artisans } from "../../../../../drizzle/schema.pg";
import { users } from "../../../../../drizzle/schema/users";
import type { ConnectAccountData } from "../../../shared/ports/stripe";

/**
 * Tests L2 — vraie base de test.
 * Pool reconciler = ownerDb (DATABASE_URL).
 * Vérification = appDb (APP_DATABASE_URL) — anti false-green (simule le rôle app_tenant prod).
 */

const ownerDbUrl = process.env.DATABASE_URL;
const appDbUrl = process.env.APP_DATABASE_URL;

describe.skipIf(!ownerDbUrl || !appDbUrl)("ConnectReconciler L2", () => {
  let ownerHandle: DbHandle;
  let appHandle: DbHandle;
  let testUserId: number;
  let testArtisanId: number;
  const ACCOUNT_ID = `acct_reconcil_${Date.now()}`;
  const OLD_DATE = new Date(Date.now() - 48 * 3_600_000);

  const stripeActive: ConnectAccountData = {
    charges_enabled: true,
    payouts_enabled: true,
    details_submitted: true,
    requirements: { currently_due: [] },
  };

  const fakeStripe = {
    accounts: new Map<string, ConnectAccountData>(),
    async retrieveConnectAccount(id: string): Promise<ConnectAccountData> {
      const acct = this.accounts.get(id);
      if (!acct) throw new Error(`no account ${id}`);
      return acct;
    },
    constructEvent: undefined as never,
    createCustomer: undefined as never,
    createInvoiceCheckout: undefined as never,
    retrieveCheckoutSession: undefined as never,
    createConnectAccount: undefined as never,
    createAccountLink: undefined as never,
  };

  beforeAll(async () => {
    ownerHandle = createDbClient(ownerDbUrl!);
    appHandle = createDbClient(appDbUrl!);

    const [user] = await ownerHandle.db.insert(users).values({
      email: `connect-reconcil-${Date.now()}@test.local`,
      role: "artisan",
    }).returning({ id: users.id });
    testUserId = user!.id;

    /* Artisan avec statut désync : local dit pending/false, Stripe dit active/true */
    const [artisan] = await ownerHandle.db.insert(artisans).values({
      userId: testUserId,
      stripeConnectAccountId: ACCOUNT_ID,
      stripeConnectStatus: "pending",
      stripeConnectChargesEnabled: false,
      stripeConnectPayoutsEnabled: false,
      stripeConnectDetailsSubmitted: false,
      stripeConnectUpdatedAt: OLD_DATE,
    }).returning({ id: artisans.id });
    testArtisanId = artisan!.id;

    fakeStripe.accounts.set(ACCOUNT_ID, stripeActive);
  });

  afterAll(async () => {
    await ownerHandle.db.delete(artisans).where(eq(artisans.id, testArtisanId));
    await ownerHandle.db.delete(users).where(eq(users.id, testUserId));
    await ownerHandle.close();
    await appHandle.close();
  });

  it("détecte le désync cross-tenant et resynchronise le statut Connect", async () => {
    await runConnectReconciler(ownerHandle.db, fakeStripe, { dryRun: false, seuil: 50 });

    /* Lecture via appDb (app_tenant) — anti false-green */
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

  it("dry-run=true — ne modifie pas le statut en base", async () => {
    /* Remettre l'artisan en état désync avant le test */
    await ownerHandle.db.update(artisans)
      .set({
        stripeConnectStatus: "pending",
        stripeConnectChargesEnabled: false,
        stripeConnectUpdatedAt: OLD_DATE,
      })
      .where(eq(artisans.id, testArtisanId));

    await runConnectReconciler(ownerHandle.db, fakeStripe, { dryRun: true, seuil: 50 });

    const [row] = await appHandle.db
      .select({ status: artisans.stripeConnectStatus, chargesEnabled: artisans.stripeConnectChargesEnabled })
      .from(artisans)
      .where(eq(artisans.id, testArtisanId))
      .limit(1);

    expect(row?.status).toBe("pending");
    expect(row?.chargesEnabled).toBe(false);
  });
});
