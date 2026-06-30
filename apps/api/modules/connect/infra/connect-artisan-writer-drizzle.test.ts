import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ConnectArtisanWriterDrizzle } from "./connect-artisan-writer-drizzle";
import { createDbClient } from "../../../shared/db";
import { artisans } from "../../../../../drizzle/schema.pg";
import { users } from "../../../../../drizzle/schema/users";
import { eq } from "drizzle-orm";

/*
 * Tests L2 — vraie DB. Writer injecté avec owner pool (cas production).
 * Lecture de vérification via app_tenant (APP_DATABASE_URL) — non-bypass RLS.
 * Règle : tester sous app_tenant pour les lectures, owner pour les écritures webhook.
 */

const ownerDbUrl = process.env.DATABASE_URL;
const appDbUrl = process.env.APP_DATABASE_URL;

describe.skipIf(!ownerDbUrl || !appDbUrl)("ConnectArtisanWriterDrizzle L2", () => {
  let ownerDb: ReturnType<typeof createDbClient>;
  let appDb: ReturnType<typeof createDbClient>;
  let writer: ConnectArtisanWriterDrizzle;
  let testUserId: number;
  let testArtisanId: number;
  const ACCOUNT_ID = `acct_test_${Date.now()}`;

  beforeAll(async () => {
    ownerDb = createDbClient(ownerDbUrl!);
    appDb = createDbClient(appDbUrl!);
    writer = new ConnectArtisanWriterDrizzle(ownerDb.db);

    /* Créer un user minimal requis par la FK artisans.userId */
    const [user] = await ownerDb.db.insert(users).values({
      email: `connect-test-${Date.now()}@test.local`,
      role: "artisan",
    }).returning({ id: users.id });
    testUserId = user!.id;

    /* Créer un artisan de test avec le stripeConnectAccountId à tester */
    const [artisan] = await ownerDb.db.insert(artisans).values({
      userId: testUserId,
      stripeConnectAccountId: ACCOUNT_ID,
      stripeConnectStatus: "none",
      stripeConnectChargesEnabled: false,
      stripeConnectPayoutsEnabled: false,
      stripeConnectDetailsSubmitted: false,
    }).returning({ id: artisans.id });
    testArtisanId = artisan!.id;
  });

  afterAll(async () => {
    await ownerDb.db.delete(artisans).where(eq(artisans.id, testArtisanId));
    await ownerDb.db.delete(users).where(eq(users.id, testUserId));
    await ownerDb.close();
    await appDb.close();
  });

  it("upsertConnectStatus passe à active quand charges_enabled=true", async () => {
    await writer.upsertConnectStatus(ACCOUNT_ID, {
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      requirements: { currently_due: [] },
    });

    /* Lecture via app_tenant — vérifie que le writer fonctionne sans owner bypass pour les lectures */
    const [row] = await appDb.db.select({
      status: artisans.stripeConnectStatus,
      chargesEnabled: artisans.stripeConnectChargesEnabled,
      payoutsEnabled: artisans.stripeConnectPayoutsEnabled,
      connectedAt: artisans.stripeConnectConnectedAt,
    }).from(artisans).where(eq(artisans.id, testArtisanId)).limit(1);

    expect(row?.status).toBe("active");
    expect(row?.chargesEnabled).toBe(true);
    expect(row?.payoutsEnabled).toBe(true);
    expect(row?.connectedAt).toBeInstanceOf(Date);
  });

  it("upsertConnectStatus passe à restricted quand details_submitted=true mais charges_enabled=false", async () => {
    await writer.upsertConnectStatus(ACCOUNT_ID, {
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: true,
    });

    const [row] = await appDb.db.select({ status: artisans.stripeConnectStatus }).from(artisans).where(eq(artisans.id, testArtisanId)).limit(1);
    expect(row?.status).toBe("restricted");
  });

  it("resetConnectStatus marque deauthorized + charges false", async () => {
    await writer.resetConnectStatus(ACCOUNT_ID);

    const [row] = await appDb.db.select({
      status: artisans.stripeConnectStatus,
      chargesEnabled: artisans.stripeConnectChargesEnabled,
      payoutsEnabled: artisans.stripeConnectPayoutsEnabled,
    }).from(artisans).where(eq(artisans.id, testArtisanId)).limit(1);

    expect(row?.status).toBe("deauthorized");
    expect(row?.chargesEnabled).toBe(false);
    expect(row?.payoutsEnabled).toBe(false);
  });

  it("upsertConnectStatus est idempotent (convergent)", async () => {
    const obj = { charges_enabled: true, payouts_enabled: true, details_submitted: true };
    await writer.upsertConnectStatus(ACCOUNT_ID, obj);
    await writer.upsertConnectStatus(ACCOUNT_ID, obj);

    const [row] = await appDb.db.select({ status: artisans.stripeConnectStatus }).from(artisans).where(eq(artisans.id, testArtisanId)).limit(1);
    expect(row?.status).toBe("active");
  });

  it("resetConnectStatus sur account ID inconnu ne plante pas (no-op silencieux)", async () => {
    await expect(writer.resetConnectStatus("acct_inexistant_xyz")).resolves.toBeUndefined();
  });
});
