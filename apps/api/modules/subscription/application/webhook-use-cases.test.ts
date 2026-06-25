import { describe, it, expect } from "vitest";
import { FakeStripePort } from "../../../shared/ports/stripe-adapter";
import { FakeWebhookPaymentWriter } from "../infra/webhook-payment-writer-fake";
import { FakeSubscriptionEventNotifier } from "../infra/subscription-event-notifier-fake";
import { processStripeWebhook } from "./webhook-use-cases";

const SIG = "valid-sig";
const SECRET = "whsec_test";

function build() {
  const stripe = new FakeStripePort();
  const paymentWriter = new FakeWebhookPaymentWriter();
  const notifier = new FakeSubscriptionEventNotifier();
  return { stripe, paymentWriter, notifier, deps: { stripe, paymentWriter, notifier, webhookSecret: SECRET, appUrl: "https://app.test" } };
}

const raw = (event: unknown) => Buffer.from(JSON.stringify(event), "utf8");

describe("processStripeWebhook (fail-closed)", () => {
  it("signature absente → 400", async () => {
    const { deps } = build();
    const r = await processStripeWebhook(deps, { rawBody: raw({}), signature: undefined });
    expect(r.http).toBe(400);
  });

  it("secret non configuré → 500 (fail-closed, jamais vérifier à vide)", async () => {
    const { stripe, paymentWriter, notifier } = build();
    const r = await processStripeWebhook({ stripe, paymentWriter, notifier, webhookSecret: "" }, { rawBody: raw({}), signature: SIG });
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

  it("event inconnu → 200 {received} sans effet", async () => {
    const { deps, paymentWriter } = build();
    const event = { id: "evt_unk", type: "customer.subscription.updated", data: { object: {} } };
    const r = await processStripeWebhook(deps, { rawBody: raw(event), signature: SIG });
    expect(r.http).toBe(200);
    expect(paymentWriter.completed).toHaveLength(0);
  });

  it("customer.subscription.trial_will_end : notif info + email rappel", async () => {
    const { deps, notifier } = build();
    const event = { id: "evt_trial", type: "customer.subscription.trial_will_end", data: { object: { customer: "cus_t", metadata: { artisanId: "13" } } } };
    const r = await processStripeWebhook(deps, { rawBody: raw(event), signature: SIG });
    expect(r.http).toBe(200);
    expect(notifier.notifs[0]).toMatchObject({ artisanId: 13, type: "info" });
    expect(notifier.emails[0]?.subject).toContain("essai Operioz se termine");
  });

  it("customer.subscription.trial_will_end : sans artisanId → skip", async () => {
    const { deps, notifier } = build();
    const event = { id: "evt_trial2", type: "customer.subscription.trial_will_end", data: { object: { customer: "cus_t", metadata: {} } } };
    await processStripeWebhook(deps, { rawBody: raw(event), signature: SIG });
    expect(notifier.notifs).toHaveLength(0);
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

  it("payment_intent.payment_failed : sans token → skip paymentWriter, dispatch billingWebhookEvent", async () => {
    const { deps } = build();
    const billingEvents: string[] = [];
    const event = { id: "evt_11", type: "payment_intent.payment_failed", data: { object: { id: "pi_3", metadata: {} } } };
    const r = await processStripeWebhook({ ...deps, onBillingWebhookEvent: async (t) => { billingEvents.push(t); } }, { rawBody: raw(event), signature: SIG });
    expect(r.http).toBe(200);
    expect(billingEvents).toEqual(["payment_intent.payment_failed"]);
  });

  it("payment_intent.succeeded : dispatch billingWebhookEvent", async () => {
    const { deps } = build();
    const billingEvents: string[] = [];
    const event = { id: "evt_12", type: "payment_intent.succeeded", data: { object: { id: "pi_4" } } };
    await processStripeWebhook({ ...deps, onBillingWebhookEvent: async (t) => { billingEvents.push(t); } }, { rawBody: raw(event), signature: SIG });
    expect(billingEvents).toEqual(["payment_intent.succeeded"]);
  });

  it("FIX-CT — onBillingWebhookEvent erreur DB logguée, retourne 200 (ne laisse pas Stripe sans retry silencieux)", async () => {
    const { deps } = build();
    const logged: string[] = [];
    const fakeLog = { error: (obj: unknown, msg: string) => { logged.push(msg); }, info: () => {}, warn: () => {}, debug: () => {} };
    const event = { id: "evt_ct", type: "payment_intent.succeeded", data: { object: { id: "pi_ct" } } };
    const r = await processStripeWebhook(
      { ...deps, log: fakeLog as never, onBillingWebhookEvent: async () => { throw new Error("DB connexion perdue"); } },
      { rawBody: raw(event), signature: SIG },
    );
    expect(r.http).toBe(200);
    expect(logged.some(m => m.includes("billing maison webhook handler failed"))).toBe(true);
  });

  it("OPE-29 — re-livraison même event.id → duplicate:true, 0 effet de bord", async () => {
    const { deps, paymentWriter, notifier } = build();
    paymentWriter.seed("tok_idem", { paiementId: 20, factureId: 99, artisanId: 5 });
    const seen = new Set<string>();
    const markWebhookProcessed = async (id: string) => { if (seen.has(id)) return false; seen.add(id); return true; };

    const event = { id: "evt_idem1", type: "checkout.session.completed", data: { object: { payment_intent: "pi_x", metadata: { token_paiement: "tok_idem", facture_id: "99" } } } };
    const r1 = await processStripeWebhook({ ...deps, markWebhookProcessed }, { rawBody: raw(event), signature: SIG });
    const r2 = await processStripeWebhook({ ...deps, markWebhookProcessed }, { rawBody: raw(event), signature: SIG });

    expect(r1.http).toBe(200);
    expect(r1.body).toEqual({ received: true });
    expect(r2.http).toBe(200);
    expect(r2.body).toEqual({ received: true, duplicate: true });
    expect(paymentWriter.completed).toHaveLength(1);
  });

  it("OPE-29 — re-livraison trial_will_end → duplicate:true, 0 notif/email supplémentaire", async () => {
    const { deps, notifier } = build();
    const seen = new Set<string>();
    const markWebhookProcessed = async (id: string) => { if (seen.has(id)) return false; seen.add(id); return true; };

    const event = { id: "evt_trial_idem", type: "customer.subscription.trial_will_end", data: { object: { metadata: { artisanId: "42" } } } };
    await processStripeWebhook({ ...deps, markWebhookProcessed }, { rawBody: raw(event), signature: SIG });
    const r2 = await processStripeWebhook({ ...deps, markWebhookProcessed }, { rawBody: raw(event), signature: SIG });

    expect(r2.body).toEqual({ received: true, duplicate: true });
    expect(notifier.notifs).toHaveLength(1);
    expect(notifier.emails).toHaveLength(1);
  });

  it("FIX-CT — onBillingWebhookEvent erreur payment_failed logguée, retourne 200", async () => {
    const { deps } = build();
    const logged: string[] = [];
    const fakeLog = { error: (obj: unknown, msg: string) => { logged.push(msg); }, info: () => {}, warn: () => {}, debug: () => {} };
    const event = { id: "evt_ct2", type: "payment_intent.payment_failed", data: { object: { id: "pi_ct2", metadata: {} } } };
    const r = await processStripeWebhook(
      { ...deps, log: fakeLog as never, onBillingWebhookEvent: async () => { throw new Error("DB timeout"); } },
      { rawBody: raw(event), signature: SIG },
    );
    expect(r.http).toBe(200);
    expect(logged.some(m => m.includes("billing maison webhook handler failed"))).toBe(true);
  });
});
