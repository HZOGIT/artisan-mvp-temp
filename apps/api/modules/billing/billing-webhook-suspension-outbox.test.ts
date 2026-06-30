import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../shared/db";
import { BillingRepositoryDrizzle } from "./infra/billing-repository-drizzle";
import { handleBillingWebhookEvent } from "./interface/http/billing-webhook-handler";
import { MAX_DUNNING_ATTEMPTS } from "./domain/billing-cycle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID = 9949095;

describe.skipIf(!URL)("billing outbox atomicité L2 (abonnement.suspendu_definitif via webhook isFinalAttempt)", () => {
  const admin = new Pool({ connectionString: URL });
  const appDb = createDbClient(APP_URL!);
  let artisanId = 0;
  let subId = 0;
  let cycleId = 0;
  let piId = "pi_susp_final_test_9949095";

  const cleanup = async () => {
    await admin.query(
      `delete from event_outbox where "artisanId" in (select id from artisans where "userId"=$1)`,
      [UID],
    );
    await admin.query(
      `delete from billing_charge_attempts where cycle_id in (
         select id from billing_cycles where subscription_id in (
           select id from billing_subscriptions where artisan_id in (select id from artisans where "userId"=$1)
         )
       )`,
      [UID],
    );
    await admin.query(
      `delete from billing_cycles where subscription_id in (
         select id from billing_subscriptions where artisan_id in (select id from artisans where "userId"=$1)
       )`,
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
      [UID, `billing-susp-outbox-${UID}@t.fr`],
    );
    const artisanRow = await admin.query(
      `insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id`,
      [UID, "Billing Suspension Outbox Test"],
    );
    artisanId = artisanRow.rows[0].id;

    const subRow = await admin.query(
      `insert into billing_subscriptions (artisan_id,plan_id,billing_mode,status,trial_ends_at)
       values ($1,'starter','maison','trialing',now() + interval '30 days') returning id`,
      [artisanId],
    );
    subId = subRow.rows[0].id;

    const cycleRow = await admin.query(
      `insert into billing_cycles (subscription_id,period_start,period_end,amount_cents,currency,status,attempt_count)
       values ($1,'2026-06-01','2026-07-01',2900,'eur','pending',$2) returning id`,
      [subId, MAX_DUNNING_ATTEMPTS],
    );
    cycleId = cycleRow.rows[0].id;

    await admin.query(
      `insert into billing_charge_attempts (cycle_id,attempt_no,idempotency_key,stripe_payment_intent_id,status)
       values ($1,$2,$3,$4,'initiated')`,
      [cycleId, MAX_DUNNING_ATTEMPTS, `ik_susp_${UID}`, piId],
    );
  });

  afterAll(async () => {
    await cleanup();
    await appDb.close();
    await admin.end();
  });

  it("updateSubscriptionStatus (past_due) et abonnement.suspendu_definitif co-écrits dans la même transaction", async () => {
    const repo = new BillingRepositoryDrizzle(appDb.db);

    await handleBillingWebhookEvent({ repo, db: appDb.db }, "payment_intent.payment_failed", piId);

    const subRow = await admin.query(
      `select status from billing_subscriptions where id=$1`,
      [subId],
    );
    expect(subRow.rows[0].status).toBe("past_due");

    const evRow = await admin.query(
      `select * from event_outbox where action='abonnement.suspendu_definitif' and "artisanId"=$1`,
      [artisanId],
    );
    expect(evRow.rows).toHaveLength(1);
    expect(evRow.rows[0].entityType).toBe("abonnement");
    expect(evRow.rows[0].entityId).toBe(subId);
    expect(evRow.rows[0].payload.reason).toBe("max_dunning_attempts");
    expect(evRow.rows[0].payload.tentativeNo).toBe(MAX_DUNNING_ATTEMPTS);
  });
});
