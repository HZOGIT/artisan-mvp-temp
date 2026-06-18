import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { SubscriptionWebhookWriterDrizzle } from "./subscription-webhook-writer-drizzle";
import { mapSubscriptionUpsert, deletedUpsertFields } from "../domain/webhook";

const URL = process.env.DATABASE_URL;
const AID = 9971101;

// La table `subscriptions` est HORS RLS (denylist) — le writer écrit par artisan_id directement
// (webhook sans cookie tenant). On teste avec le rôle par défaut (DATABASE_URL).
describe.skipIf(!URL)("SubscriptionWebhookWriterDrizzle (subscriptions HORS RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const db = createDbClient(URL!);
  const writer = new SubscriptionWebhookWriterDrizzle(db.db);

  const cleanup = () => admin.query("delete from subscriptions where artisan_id = $1", [AID]);

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await db.close();
    await admin.end();
  });

  it("applyUpsert : insert puis update (ON CONFLICT artisan_id) + getArtisanIdByCustomerId", async () => {
    const sub = { id: "sub_a", customer: "cus_webhooktest_A", status: "active", metadata: { plan: "pro", artisanId: String(AID) }, items: { data: [{ price: { id: "price_pro" } }] } };
    await writer.applyUpsert(AID, mapSubscriptionUpsert(sub));
    let rows = (await admin.query("select plan, status, stripe_customer_id, max_users from subscriptions where artisan_id=$1", [AID])).rows;
    expect(rows[0].plan).toBe("pro");
    expect(rows[0].stripe_customer_id).toBe("cus_webhooktest_A");

    expect(await writer.getArtisanIdByCustomerId("cus_webhooktest_A")).toBe(AID);
    expect(await writer.getArtisanIdByCustomerId("cus_inexistant")).toBeNull();

    // 2e upsert (entreprise) → met à jour la même ligne (pas de doublon : artisan_id unique)
    await writer.applyUpsert(AID, mapSubscriptionUpsert({ ...sub, status: "trialing", metadata: { plan: "entreprise", artisanId: String(AID) } }));
    rows = (await admin.query("select plan, status from subscriptions where artisan_id=$1", [AID])).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].plan).toBe("entreprise");
    expect(rows[0].status).toBe("trialing");
  });

  it("applyDeleted : plan expired / status canceled", async () => {
    await writer.applyDeleted(AID, deletedUpsertFields());
    const rows = (await admin.query("select plan, status, cancel_at_period_end from subscriptions where artisan_id=$1", [AID])).rows;
    expect(rows[0].plan).toBe("expired");
    expect(rows[0].status).toBe("canceled");
    expect(rows[0].cancel_at_period_end).toBe(false);
  });
});
