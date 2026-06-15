import { describe, it, expect } from "vitest";
import { FakeStripePort } from "../../../shared/ports/stripe-adapter";
import { FakeSubscriptionWebhookWriter } from "../infra/subscription-webhook-writer-fake";
import { FakeWebhookPaymentWriter } from "../infra/webhook-payment-writer-fake";
import { processStripeWebhook } from "./webhook-use-cases";

const SIG = "valid-sig";
const SECRET = "whsec_test";

function build() {
  const stripe = new FakeStripePort();
  const writer = new FakeSubscriptionWebhookWriter();
  const paymentWriter = new FakeWebhookPaymentWriter();
  return { stripe, writer, paymentWriter, deps: { stripe, writer, paymentWriter, webhookSecret: SECRET } };
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

  it("event non géré (invoice.payment_succeeded) → 200 {received} sans effet (slice C)", async () => {
    const { deps, writer } = build();
    const event = { id: "evt_6", type: "invoice.payment_succeeded", data: { object: {} } };
    const r = await processStripeWebhook(deps, { rawBody: raw(event), signature: SIG });
    expect(r.http).toBe(200);
    expect(r.body).toEqual({ received: true });
    expect(writer.upserts).toHaveLength(0);
  });

  it("checkout.session.completed : paiement résolu par token → completeCheckout", async () => {
    const { deps, paymentWriter } = build();
    paymentWriter.seed("tok_pay", { paiementId: 5, factureId: 42, artisanId: 7 });
    const event = { id: "evt_7", type: "checkout.session.completed", data: { object: { id: "cs_1", payment_intent: "pi_1", metadata: { token_paiement: "tok_pay", facture_id: "42" } } } };
    const r = await processStripeWebhook(deps, { rawBody: raw(event), signature: SIG });
    expect(r.http).toBe(200);
    expect(paymentWriter.completed).toEqual([{ artisanId: 7, paiementId: 5, factureId: 42, stripePaymentIntentId: "pi_1" }]);
  });

  it("checkout.session.completed : metadata incomplet (pas de token) → skip", async () => {
    const { deps, paymentWriter } = build();
    const event = { id: "evt_8", type: "checkout.session.completed", data: { object: { id: "cs_2", metadata: { facture_id: "42" } } } };
    await processStripeWebhook(deps, { rawBody: raw(event), signature: SIG });
    expect(paymentWriter.completed).toHaveLength(0);
  });

  it("checkout.session.completed : token inconnu → skip (resolvePaiement null)", async () => {
    const { deps, paymentWriter } = build();
    const event = { id: "evt_9", type: "checkout.session.completed", data: { object: { id: "cs_3", metadata: { token_paiement: "absent", facture_id: "42" } } } };
    await processStripeWebhook(deps, { rawBody: raw(event), signature: SIG });
    expect(paymentWriter.completed).toHaveLength(0);
  });

  it("payment_intent.payment_failed : paiement résolu par token → failPaiement", async () => {
    const { deps, paymentWriter } = build();
    paymentWriter.seed("tok_fail", { paiementId: 9, factureId: 1, artisanId: 3 });
    const event = { id: "evt_10", type: "payment_intent.payment_failed", data: { object: { id: "pi_2", metadata: { token_paiement: "tok_fail" } } } };
    await processStripeWebhook(deps, { rawBody: raw(event), signature: SIG });
    expect(paymentWriter.failed).toEqual([{ artisanId: 3, paiementId: 9 }]);
  });
});
