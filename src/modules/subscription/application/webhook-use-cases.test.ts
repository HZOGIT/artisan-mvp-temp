import { describe, it, expect } from "vitest";
import { FakeStripePort } from "../../../shared/ports/stripe-adapter";
import { FakeSubscriptionWebhookWriter } from "../infra/subscription-webhook-writer-fake";
import { processStripeWebhook } from "./webhook-use-cases";

const SIG = "valid-sig";
const SECRET = "whsec_test";

function build() {
  const stripe = new FakeStripePort();
  const writer = new FakeSubscriptionWebhookWriter();
  return { stripe, writer, deps: { stripe, writer, webhookSecret: SECRET } };
}

const raw = (event: unknown) => Buffer.from(JSON.stringify(event), "utf8");

describe("processStripeWebhook (fail-closed + sync abonnement)", () => {
  it("signature absente → 400", async () => {
    const { deps } = build();
    const r = await processStripeWebhook(deps, { rawBody: raw({}), signature: undefined });
    expect(r.http).toBe(400);
  });

  it("secret non configuré → 500 (fail-closed, jamais vérifier à vide)", async () => {
    const { stripe, writer } = build();
    const r = await processStripeWebhook({ stripe, writer, webhookSecret: "" }, { rawBody: raw({}), signature: SIG });
    expect(r.http).toBe(500);
  });

  it("signature invalide → 400 (constructEvent throw)", async () => {
    const { deps } = build();
    const r = await processStripeWebhook(deps, { rawBody: raw({ id: "evt_1", type: "x", data: { object: {} } }), signature: "WRONG" });
    expect(r.http).toBe(400);
  });

  it("event de test (evt_test_) → 200 {verified}", async () => {
    const { deps } = build();
    const r = await processStripeWebhook(deps, { rawBody: raw({ id: "evt_test_1", type: "x", data: { object: {} } }), signature: SIG });
    expect(r.http).toBe(200);
    expect(r.body).toEqual({ verified: true });
  });

  it("customer.subscription.updated : upsert (artisanId via metadata)", async () => {
    const { deps, writer } = build();
    const event = { id: "evt_2", type: "customer.subscription.updated", data: { object: { id: "sub_1", customer: "cus_1", status: "active", metadata: { plan: "pro", artisanId: "7" }, items: { data: [{ price: { id: "price_pro" } }] } } } };
    const r = await processStripeWebhook(deps, { rawBody: raw(event), signature: SIG });
    expect(r.http).toBe(200);
    expect(writer.upserts).toHaveLength(1);
    expect(writer.upserts[0].artisanId).toBe(7);
    expect(writer.upserts[0].fields.plan).toBe("pro");
  });

  it("subscription.updated : artisanId résolu par customerId si pas de metadata", async () => {
    const { deps, writer } = build();
    writer.seedCustomer("cus_9", 99);
    const event = { id: "evt_3", type: "customer.subscription.created", data: { object: { id: "sub_9", customer: "cus_9", status: "trialing", metadata: {} } } };
    await processStripeWebhook(deps, { rawBody: raw(event), signature: SIG });
    expect(writer.upserts[0].artisanId).toBe(99);
  });

  it("subscription.updated : artisanId introuvable → skip (pas d'upsert)", async () => {
    const { deps, writer } = build();
    const event = { id: "evt_4", type: "customer.subscription.updated", data: { object: { id: "sub_x", customer: "cus_inconnu", status: "active", metadata: {} } } };
    const r = await processStripeWebhook(deps, { rawBody: raw(event), signature: SIG });
    expect(r.http).toBe(200);
    expect(writer.upserts).toHaveLength(0);
  });

  it("customer.subscription.deleted : applyDeleted (expired/canceled)", async () => {
    const { deps, writer } = build();
    const event = { id: "evt_5", type: "customer.subscription.deleted", data: { object: { id: "sub_1", customer: "cus_1", metadata: { artisanId: "7" } } } };
    await processStripeWebhook(deps, { rawBody: raw(event), signature: SIG });
    expect(writer.deletes).toEqual([{ artisanId: 7, plan: "expired", status: "canceled" }]);
  });

  it("event non géré (invoice.payment_succeeded) → 200 {received} sans effet (slice B)", async () => {
    const { deps, writer } = build();
    const event = { id: "evt_6", type: "invoice.payment_succeeded", data: { object: {} } };
    const r = await processStripeWebhook(deps, { rawBody: raw(event), signature: SIG });
    expect(r.http).toBe(200);
    expect(r.body).toEqual({ received: true });
    expect(writer.upserts).toHaveLength(0);
  });
});
