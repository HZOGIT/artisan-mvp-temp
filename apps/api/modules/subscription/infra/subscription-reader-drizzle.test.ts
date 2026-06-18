import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { SubscriptionReaderDrizzle } from "./subscription-reader-drizzle";
import { getCurrent } from "../application/use-cases";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 9944001;
const B = 9944002;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("SubscriptionReaderDrizzle (PG : subscriptions HORS RLS, scope artisan_id explicite)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const reader = new SubscriptionReaderDrizzle(app.db);

  const cleanup = async () => {
    await admin.query("delete from subscriptions where artisan_id in ($1,$2)", [A, B]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into subscriptions (artisan_id, plan, status, trial_ends_at, max_users) values ($1,'pro','active',null,5)", [A]);
    await admin.query("insert into subscriptions (artisan_id, plan, status, trial_ends_at) values ($1,'trial','trialing', now() + interval '10 days')", [B]);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("getSubscription(A) : plan pro, maxUsers 5 ; scope explicite", async () => {
    const sub = await reader.getSubscription(ctx(A));
    expect(sub).toMatchObject({ artisanId: A, plan: "pro", status: "active", maxUsers: 5 });
  });

  it("getCurrent(B) : essai en cours → isTrialing true + jours restants > 0", async () => {
    const cur = await getCurrent(reader, ctx(B));
    expect(cur.plan).toBe("trial");
    expect(cur.isTrialing).toBe(true);
    expect(cur.trialDaysLeft).toBeGreaterThan(0);
  });

  it("tenant sans abonnement → défauts (trial/trialing)", async () => {
    expect(await reader.getSubscription(ctx(9944999))).toBeNull();
    expect((await getCurrent(reader, ctx(9944999))).plan).toBe("trial");
  });
});
