import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../shared/db";
import { BillingRepositoryDrizzle } from "./infra/billing-repository-drizzle";
import { syncSubscriptionFromStripe } from "./application/billing-use-cases";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID = 9949094;

describe.skipIf(!URL)("billing outbox atomicité L2 (abonnement.stripe_sync via syncSubscriptionFromStripe)", () => {
  const admin = new Pool({ connectionString: URL });
  const appDb = createDbClient(APP_URL!);
  let artisanId = 0;

  const cleanup = async () => {
    await admin.query(
      `delete from event_outbox where "artisanId" in (select id from artisans where "userId"=$1)`,
      [UID],
    );
    await admin.query(
      `delete from billing_subscriptions where artisan_id in (select id from artisans where "userId"=$1)`,
      [UID],
    );
    await admin.query(`delete from artisans where "userId"=$1`, [UID]);
    await admin.query(`delete from users where id=$1`, [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query(
      `insert into users (id,email,password,role) values ($1,$2,'x','artisan')`,
      [UID, `webhook-sync-atomicity-${UID}@t.fr`],
    );
    const artisanRow = await admin.query(
      `insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id`,
      [UID, "Webhook Sync Atomicity Test"],
    );
    artisanId = artisanRow.rows[0].id;
    await admin.query(
      `insert into billing_subscriptions (artisan_id,plan_id,billing_mode,status,trial_ends_at)
       values ($1,'starter','stripe','trialing',now() + interval '30 days')`,
      [artisanId],
    );
  });

  afterAll(async () => {
    await cleanup();
    await appDb.close();
    await admin.end();
  });

  it("updateSubscriptionStatus trialing et abonnement.stripe_sync co-écrits dans la même transaction", async () => {
    const repo = new BillingRepositoryDrizzle(appDb.db);

    await syncSubscriptionFromStripe({ repo, db: appDb.db }, artisanId, "price_pro_monthly", "trialing");

    const subRow = await admin.query(
      `select status, plan_id from billing_subscriptions where artisan_id=$1`,
      [artisanId],
    );
    expect(subRow.rows[0].status).toBe("trialing");
    expect(subRow.rows[0].plan_id).toBe("pro");

    const evRow = await admin.query(
      `select * from event_outbox where action='abonnement.stripe_sync' and "artisanId"=$1`,
      [artisanId],
    );
    expect(evRow.rows).toHaveLength(1);
    expect(evRow.rows[0].entityType).toBe("abonnement");
    expect(evRow.rows[0].entityId).toBe(artisanId);
  });
});
