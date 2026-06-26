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

describe.skipIf(!URL)("SubscriptionReaderDrizzle — fallback legacy (subscriptions, pas de RLS)", () => {
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

describe.skipIf(!URL)("SubscriptionReaderDrizzle — billing_subscriptions sous RLS (OPE-645)", () => {
  const C = 9944003;
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const reader = new SubscriptionReaderDrizzle(app.db);

  afterAll(async () => {
    await admin.query(
      "update billing_subscriptions set status='trialing', payment_method_id=null where artisan_id=$1",
      [C],
    );
    await admin.query("delete from billing_subscriptions where artisan_id=$1", [C]);
    await app.close();
    await admin.end();
  });

  it("getSubscription retourne la ligne billing_subscriptions sous RLS (withTenant posé)", async () => {
    await admin.query(
      `insert into billing_subscriptions (artisan_id, plan_id, billing_mode, status, trial_ends_at)
       values ($1, 'pro', 'maison', 'trialing', now() + interval '14 days')
       on conflict (artisan_id) do update set plan_id = 'pro', status = 'trialing'`,
      [C],
    );
    const sub = await reader.getSubscription(ctx(C));
    expect(sub).not.toBeNull();
    expect(sub?.artisanId).toBe(C);
    expect(sub?.plan).toBe("pro");
    expect(sub?.status).toBe("trialing");
  });

  it("getCurrent : paywall correct depuis billing_subscriptions (isTrialing vrai, plan pro)", async () => {
    const cur = await getCurrent(reader, ctx(C));
    expect(cur.plan).toBe("pro");
    expect(cur.isTrialing).toBe(true);
  });
});
