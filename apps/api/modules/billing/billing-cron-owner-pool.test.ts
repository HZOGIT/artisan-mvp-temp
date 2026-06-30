import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../shared/db";
import { BillingRepositoryDrizzle } from "./infra/billing-repository-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL = process.env.APP_DATABASE_URL;

// UID unique — isolé de billing-outbox-atomicity (9949092)
const UID = 9949099;

describe.skipIf(!URL || !APP_URL)("billing cron — pool owner requis (L2)", () => {
  const admin = new Pool({ connectionString: URL });
  const ownerDb = createDbClient(URL!);
  const appTenantDb = createDbClient(APP_URL!);
  let artisanId = 0;

  const cleanup = async () => {
    await admin.query(
      `delete from billing_cycles where subscription_id in
       (select id from billing_subscriptions where artisan_id in
        (select id from artisans where "userId"=$1))`,
      [UID],
    );
    // billing_subscriptions référence billing_payment_methods via FK RESTRICT → supprimer d'abord
    await admin.query(
      `delete from billing_subscriptions where artisan_id in
       (select id from artisans where "userId"=$1)`,
      [UID],
    );
    await admin.query(
      `delete from billing_payment_methods where artisan_id in
       (select id from artisans where "userId"=$1)`,
      [UID],
    );
    await admin.query(`delete from artisans where "userId"=$1`, [UID]);
    await admin.query(`delete from users where id=$1`, [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query(
      `insert into users (id, email, password, role) values ($1, $2, 'x', 'artisan')`,
      [UID, `billing-cron-owner-${UID}@t.fr`],
    );
    const artisanRow = await admin.query(
      `insert into artisans ("userId", "nomEntreprise") values ($1, $2) returning id`,
      [UID, "Billing Cron Owner Test"],
    );
    artisanId = artisanRow.rows[0].id;

    const pmRow = await admin.query(
      `insert into billing_payment_methods
        (artisan_id, stripe_customer_id, stripe_payment_method_id, brand, last4, exp_month, exp_year, is_default, consented_at)
        values ($1, 'cus_cron_test', 'pm_cron_test', 'visa', '4242', 12, 2028, true, now())
        returning id`,
      [artisanId],
    );
    const pmId = pmRow.rows[0].id;

    const subRow = await admin.query(
      `insert into billing_subscriptions
        (artisan_id, plan_id, billing_interval, billing_mode, status, payment_method_id,
         current_period_start, current_period_end)
        values ($1, 'starter', 'monthly', 'maison', 'active', $2,
                now() - interval '1 month', now() - interval '1 day')
        returning id`,
      [artisanId, pmId],
    );
    const subId = subRow.rows[0].id;

    await admin.query(
      `insert into billing_cycles
        (subscription_id, period_start, period_end, amount_cents, currency, status)
        values ($1, now() - interval '1 day', now() + interval '30 days', 2900, 'eur', 'pending')`,
      [subId],
    );
  });

  afterAll(async () => {
    await cleanup();
    await ownerDb.close();
    await appTenantDb.close();
    await admin.end();
  });

  it("app_tenant sans tenant → 0 résultat (reproduit le no-op silencieux)", async () => {
    // billing_payment_methods est RLS-FORCE : sans SET app.tenant, app_tenant voit 0 ligne
    // → pms vide → aucune SubscriptionWithDueCycle retournée → facturation bloquée silencieusement
    const repo = new BillingRepositoryDrizzle(appTenantDb.db);
    const due = await repo.findSubscriptionsWithDueCycles(new Date());
    expect(due).toHaveLength(0);
  });

  it("pool owner → retourne le cycle échu (fix)", async () => {
    // owner bypasse la RLS → billing_payment_methods lisible → cycle découvert
    const repo = new BillingRepositoryDrizzle(ownerDb.db);
    const due = await repo.findSubscriptionsWithDueCycles(new Date());
    expect(due.length).toBeGreaterThanOrEqual(1);
    const entry = due.find(d => d.subscription.artisan_id === artisanId);
    expect(entry).toBeDefined();
    expect(entry!.cycle.status).toBe("pending");
    expect(entry!.paymentMethod.is_default).toBe(true);
  });
});
