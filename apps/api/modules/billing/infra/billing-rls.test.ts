import { describe, it, expect, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db/client";
import { withTenant } from "../../../shared/db/with-tenant";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 997801;
const B = 997802;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("RLS billing_payment_methods + billing_subscriptions (OPE-645)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);

  const cleanup = async () => {
    await admin.query(
      "update billing_subscriptions set status='trialing', payment_method_id=null where artisan_id in ($1,$2)",
      [A, B],
    );
    await admin.query("delete from billing_subscriptions where artisan_id in ($1,$2)", [A, B]);
    await admin.query("delete from billing_payment_methods where artisan_id in ($1,$2)", [A, B]);
  };

  afterAll(async () => {
    await cleanup().catch(() => {});
    await app.close();
    await admin.end();
  });

  it("app_tenant peut INSERT dans billing_payment_methods pour son artisanId", async () => {
    await cleanup();
    const result = await withTenant(app.db, ctx(A), (tx) =>
      tx.execute(sql`
        insert into billing_payment_methods
          (artisan_id, stripe_customer_id, stripe_payment_method_id, brand, last4, exp_month, exp_year, is_default, consented_at)
        values
          (${A}, 'cus_rls_test', 'pm_rls_test', 'visa', '4242', 12, 2030, false, now())
        returning id, artisan_id
      `),
    );
    expect(result.rows[0]).toBeDefined();
    expect(result.rows[0].artisan_id).toBe(A);
  });

  it("app_tenant ne voit PAS les billing_payment_methods d'un autre artisan (isolation RLS)", async () => {
    await admin.query(
      `insert into billing_payment_methods
        (artisan_id, stripe_customer_id, stripe_payment_method_id, brand, last4, exp_month, exp_year, is_default, consented_at)
       values ($1, 'cus_rls_b', 'pm_rls_b', 'mastercard', '1234', 6, 2028, false, now())
       on conflict do nothing`,
      [B],
    );
    const result = await withTenant(app.db, ctx(A), (tx) =>
      tx.execute(sql`select id from billing_payment_methods where artisan_id = ${B}`),
    );
    expect(result.rows).toHaveLength(0);
  });

  it("app_tenant peut INSERT dans billing_subscriptions pour son artisanId", async () => {
    const result = await withTenant(app.db, ctx(A), (tx) =>
      tx.execute(sql`
        insert into billing_subscriptions
          (artisan_id, plan_id, billing_mode, status, current_period_start, current_period_end)
        values
          (${A}, 'starter', 'maison', 'trialing', now(), now() + interval '30 days')
        on conflict (artisan_id) do update set plan_id = excluded.plan_id
        returning id, artisan_id, plan_id
      `),
    );
    expect(result.rows[0]).toBeDefined();
    expect(result.rows[0].artisan_id).toBe(A);
  });
});
