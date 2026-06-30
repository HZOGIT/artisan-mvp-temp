import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../shared/db";
import { BillingRepositoryDrizzle } from "./infra/billing-repository-drizzle";
import { cancelAtPeriodEnd } from "./application/billing-use-cases";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID = 9949092;

describe.skipIf(!URL)("billing outbox atomicité L2 (cancelAtPeriodEnd)", () => {
  const admin = new Pool({ connectionString: URL });
  const appDb = createDbClient(APP_URL!);
  let artisanId = 0;
  let subId = 0;

  const cleanup = async () => {
    await admin.query(
      `delete from event_outbox where "artisanId" in (select id from artisans where "userId"=$1)`,
      [UID],
    );
    await admin.query(
      `delete from billing_events where entity_id in (select id from billing_subscriptions where artisan_id in (select id from artisans where "userId"=$1))`,
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
      [UID, `billing-atomicity-${UID}@t.fr`],
    );
    const artisanRow = await admin.query(
      `insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id`,
      [UID, "Billing Atomicity Test"],
    );
    artisanId = artisanRow.rows[0].id;
    const subRow = await admin.query(
      `insert into billing_subscriptions (artisan_id,plan_id,billing_mode,status,trial_ends_at)
       values ($1,'starter','maison','trialing',now() + interval '30 days') returning id`,
      [artisanId],
    );
    subId = subRow.rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await appDb.close();
    await admin.end();
  });

  it("cancel_at et event_outbox sont co-écrits dans la même transaction", async () => {
    const repo = new BillingRepositoryDrizzle(appDb.db);
    const ctx = { artisanId, userId: UID };

    await cancelAtPeriodEnd({ repo, db: appDb.db }, ctx);

    const subRow = await admin.query(
      `select cancel_at from billing_subscriptions where id=$1`,
      [subId],
    );
    expect(subRow.rows[0].cancel_at).not.toBeNull();

    const evRow = await admin.query(
      `select * from event_outbox where action='abonnement.annulation_planifiee' and "artisanId"=$1`,
      [artisanId],
    );
    expect(evRow.rows).toHaveLength(1);
    expect(evRow.rows[0].entityType).toBe("abonnement");
    expect(evRow.rows[0].entityId).toBe(subId);
  });
});
