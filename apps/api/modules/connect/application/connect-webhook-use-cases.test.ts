import { describe, it, expect, vi } from "vitest";
import { processConnectWebhook } from "./connect-webhook-use-cases";
import type { ConnectWebhookDeps } from "./connect-webhook-use-cases";
import type { ConnectArtisanWriter } from "./connect-artisan-writer";
import type { WebhookPaymentWriter } from "../../subscription/application/webhook-payment-writer";
import type { StripePort, StripeWebhookEvent } from "../../../shared/ports/stripe";

/*
 * Tests L1 — writer injecté en fake. La logique DB réelle est dans infra/.
 * La logique de dérivation de statut (pending/restricted/active/deauthorized) est dans domain/.
 */

function makeStripe(event: StripeWebhookEvent | null, throwOnConstruct = false): StripePort {
  return {
    constructEvent: vi.fn().mockImplementation(() => {
      if (throwOnConstruct) throw new Error("Invalid signature");
      if (!event) throw new Error("no event");
      return Promise.resolve(event);
    }),
    createCustomer: vi.fn(),
    createInvoiceCheckout: vi.fn(),
    retrieveCheckoutSession: vi.fn(),
  };
}

function makeWriter(): ConnectArtisanWriter & { upsertConnectStatus: ReturnType<typeof vi.fn>; resetConnectStatus: ReturnType<typeof vi.fn> } {
  return {
    upsertConnectStatus: vi.fn().mockResolvedValue(undefined),
    resetConnectStatus: vi.fn().mockResolvedValue(undefined),
  };
}

function makePaymentWriter(): WebhookPaymentWriter & {
  resolvePaiement: ReturnType<typeof vi.fn>;
  completeCheckout: ReturnType<typeof vi.fn>;
  failPaiement: ReturnType<typeof vi.fn>;
} {
  return {
    resolvePaiement: vi.fn().mockResolvedValue({ paiementId: 1, factureId: 42, artisanId: 7 }),
    completeCheckout: vi.fn().mockResolvedValue({ transitioned: true }),
    failPaiement: vi.fn().mockResolvedValue(undefined),
  };
}

function makeDeps(
  event: StripeWebhookEvent | null,
  opts: { throwOnConstruct?: boolean; writer?: ConnectArtisanWriter; paymentWriter?: WebhookPaymentWriter } = {},
): ConnectWebhookDeps {
  return {
    stripe: makeStripe(event, opts.throwOnConstruct),
    writer: opts.writer ?? makeWriter(),
    webhookSecret: "whsec_test",
    paymentWriter: opts.paymentWriter,
  };
}

const RAW = Buffer.from("{}");
const SIG = "t=1,v1=abc";

describe("processConnectWebhook", () => {
  it("retourne 400 si signature absente", async () => {
    const result = await processConnectWebhook(makeDeps(null), { rawBody: RAW, signature: undefined });
    expect(result.http).toBe(400);
    expect(result.body).toMatchObject({ error: "Missing signature" });
  });

  it("retourne 500 si webhookSecret vide", async () => {
    const deps: ConnectWebhookDeps = { stripe: makeStripe(null), writer: makeWriter(), webhookSecret: "" };
    const result = await processConnectWebhook(deps, { rawBody: RAW, signature: SIG });
    expect(result.http).toBe(500);
  });

  it("rotation — getter appelé par requête : nouveau secret utilisé sans ré-enregistrement", async () => {
    let currentSecret = "whsec_v1";
    const captured: string[] = [];
    const baseStripe = makeStripe({ id: "evt_test_r1", type: "account.updated", data: { object: {} } });
    const spyStripe = {
      ...baseStripe,
      constructEvent: vi.fn().mockImplementation(async (_rb: Buffer, _sig: string, sec: string) => { captured.push(sec); return { id: "evt_test_r1", type: "account.updated", data: { object: {} } }; }),
    };
    const common: ConnectWebhookDeps = { stripe: spyStripe, writer: makeWriter(), webhookSecret: () => currentSecret };
    await processConnectWebhook(common, { rawBody: RAW, signature: SIG });
    currentSecret = "whsec_v2";
    await processConnectWebhook(common, { rawBody: RAW, signature: SIG });
    expect(captured).toEqual(["whsec_v1", "whsec_v2"]);
  });

  it("retourne 400 si signature invalide (constructEvent throw)", async () => {
    const result = await processConnectWebhook(makeDeps(null, { throwOnConstruct: true }), { rawBody: RAW, signature: SIG });
    expect(result.http).toBe(400);
    expect(result.body).toMatchObject({ error: "Webhook signature verification failed" });
  });

  it("traite les events evt_test_* comme de vrais events (mode test Stripe = préfixe evt_test_ sur tous les events réels)", async () => {
    const writer = makeWriter();
    const obj = { id: "acct_1", charges_enabled: true, payouts_enabled: true, details_submitted: true };
    const event: StripeWebhookEvent = { id: "evt_test_123", type: "account.updated", account: "acct_1", data: { object: obj } };
    const result = await processConnectWebhook(makeDeps(event, { writer }), { rawBody: RAW, signature: SIG });
    expect(result.http).toBe(200);
    expect(result.body).toMatchObject({ received: true });
    expect(writer.upsertConnectStatus).toHaveBeenCalledWith("acct_1", obj);
  });

  describe("account.updated", () => {
    it("appelle writer.upsertConnectStatus avec l'account ID", async () => {
      const writer = makeWriter();
      const obj = { id: "acct_123", charges_enabled: true, payouts_enabled: true, details_submitted: true };
      const event: StripeWebhookEvent = { id: "evt_live_1", type: "account.updated", account: "acct_123", data: { object: obj } };
      const result = await processConnectWebhook(makeDeps(event, { writer }), { rawBody: RAW, signature: SIG });
      expect(result.http).toBe(200);
      expect(writer.upsertConnectStatus).toHaveBeenCalledWith("acct_123", obj);
    });

    it("utilise data.object.id comme fallback si event.account absent", async () => {
      const writer = makeWriter();
      const obj = { id: "acct_fallback", charges_enabled: false, payouts_enabled: false, details_submitted: false };
      const event: StripeWebhookEvent = { id: "evt_live_2", type: "account.updated", data: { object: obj } };
      await processConnectWebhook(makeDeps(event, { writer }), { rawBody: RAW, signature: SIG });
      expect(writer.upsertConnectStatus).toHaveBeenCalledWith("acct_fallback", obj);
    });

    it("n'appelle pas upsert si account ID introuvable", async () => {
      const writer = makeWriter();
      const event: StripeWebhookEvent = { id: "evt_live_3", type: "account.updated", data: { object: { charges_enabled: true } } };
      await processConnectWebhook(makeDeps(event, { writer }), { rawBody: RAW, signature: SIG });
      expect(writer.upsertConnectStatus).not.toHaveBeenCalled();
    });
  });

  describe("account.application.deauthorized", () => {
    it("appelle writer.resetConnectStatus avec event.account", async () => {
      const writer = makeWriter();
      const event: StripeWebhookEvent = { id: "evt_live_4", type: "account.application.deauthorized", account: "acct_deauth", data: { object: { id: "ca_app" } } };
      const result = await processConnectWebhook(makeDeps(event, { writer }), { rawBody: RAW, signature: SIG });
      expect(result.http).toBe(200);
      expect(writer.resetConnectStatus).toHaveBeenCalledWith("acct_deauth");
    });

    it("ne touche pas le writer si event.account absent", async () => {
      const writer = makeWriter();
      const event: StripeWebhookEvent = { id: "evt_live_5", type: "account.application.deauthorized", data: { object: {} } };
      await processConnectWebhook(makeDeps(event, { writer }), { rawBody: RAW, signature: SIG });
      expect(writer.resetConnectStatus).not.toHaveBeenCalled();
    });
  });

  it("retourne 200 sur event inconnu (pass-through)", async () => {
    const writer = makeWriter();
    const event: StripeWebhookEvent = { id: "evt_live_6", type: "payment_intent.succeeded", data: { object: {} } };
    const result = await processConnectWebhook(makeDeps(event, { writer }), { rawBody: RAW, signature: SIG });
    expect(result.http).toBe(200);
    expect(writer.upsertConnectStatus).not.toHaveBeenCalled();
  });

  it("retourne 500 si le writer throw", async () => {
    const writer = makeWriter();
    writer.upsertConnectStatus.mockRejectedValueOnce(new Error("DB error"));
    const event: StripeWebhookEvent = { id: "evt_live_7", type: "account.updated", account: "acct_err", data: { object: { id: "acct_err" } } };
    const result = await processConnectWebhook(makeDeps(event, { writer }), { rawBody: RAW, signature: SIG });
    expect(result.http).toBe(500);
  });

  describe("checkout.session.completed (direct charge Lot 4)", () => {
    it("solde le paiement si paymentWriter fourni + token présent", async () => {
      const paymentWriter = makePaymentWriter();
      const session = { payment_intent: "pi_test_1", metadata: { token_paiement: "tok_abc", facture_id: "42" } };
      const event: StripeWebhookEvent = { id: "evt_live_8", type: "checkout.session.completed", account: "acct_123", data: { object: session } };
      const result = await processConnectWebhook(makeDeps(event, { paymentWriter }), { rawBody: RAW, signature: SIG });
      expect(result.http).toBe(200);
      expect(paymentWriter.resolvePaiement).toHaveBeenCalledWith("tok_abc");
      expect(paymentWriter.completeCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ artisanId: 7, factureId: 42, stripePaymentIntentId: "pi_test_1" }),
      );
    });

    it("ignore si paymentWriter absent (rétrocompatibilité)", async () => {
      const event: StripeWebhookEvent = {
        id: "evt_live_9", type: "checkout.session.completed", account: "acct_123",
        data: { object: { payment_intent: "pi_1", metadata: { token_paiement: "tok_x", facture_id: "1" } } },
      };
      const result = await processConnectWebhook(makeDeps(event), { rawBody: RAW, signature: SIG });
      expect(result.http).toBe(200);
    });

    it("ignore si token_paiement absent (event non-facture)", async () => {
      const paymentWriter = makePaymentWriter();
      const event: StripeWebhookEvent = {
        id: "evt_live_10", type: "checkout.session.completed", account: "acct_123",
        data: { object: { payment_intent: "pi_1", metadata: {} } },
      };
      const result = await processConnectWebhook(makeDeps(event, { paymentWriter }), { rawBody: RAW, signature: SIG });
      expect(result.http).toBe(200);
      expect(paymentWriter.completeCheckout).not.toHaveBeenCalled();
    });

    it("OPE-976 — onCheckoutCompletedEmail appelé avec données metadata Stripe", async () => {
      const paymentWriter = makePaymentWriter();
      const emailCalls: Array<{ artisanId: number; factureId: number; clientId: number; clientEmail: string; clientName: string; factureNumero: string; totalTTC: string }> = [];
      const session = { payment_intent: "pi_em4", amount_total: 18000, metadata: { token_paiement: "tok_connect_em", facture_id: "99", customer_email: "client@connect.com", customer_name: "Charlie Martin", numero_facture: "FAC-2026-099", user_id: "77" } };
      const event: StripeWebhookEvent = { id: "evt_connect_em1", type: "checkout.session.completed", account: "acct_1", data: { object: session } };
      const result = await processConnectWebhook({ ...makeDeps(event, { paymentWriter }), onCheckoutCompletedEmail: async (d) => { emailCalls.push(d); } }, { rawBody: RAW, signature: SIG });
      expect(result.http).toBe(200);
      expect(emailCalls).toHaveLength(1);
      expect(emailCalls[0]).toMatchObject({ artisanId: 7, factureId: 42, clientId: 77, clientEmail: "client@connect.com", clientName: "Charlie Martin", factureNumero: "FAC-2026-099", totalTTC: "180.00 €" });
    });

    it("OPE-991 — transitioned=false (doublon webhook+poller) → email NON envoyé", async () => {
      const paymentWriter = makePaymentWriter();
      paymentWriter.completeCheckout.mockResolvedValueOnce({ transitioned: false });
      const emailCalls: unknown[] = [];
      const session = { payment_intent: "pi_dedup", amount_total: 5000, metadata: { token_paiement: "tok_dedup", facture_id: "99", customer_email: "dup@test.com", customer_name: "Dup", numero_facture: "FAC-DUP", user_id: "1" } };
      const event: StripeWebhookEvent = { id: "evt_dedup", type: "checkout.session.completed", account: "acct_1", data: { object: session } };
      await processConnectWebhook({ ...makeDeps(event, { paymentWriter }), onCheckoutCompletedEmail: async (d) => { emailCalls.push(d); } }, { rawBody: RAW, signature: SIG });
      expect(emailCalls).toHaveLength(0);
    });

    it("OPE-976 — erreur onCheckoutCompletedEmail → 200 + loggée (best-effort)", async () => {
      const paymentWriter = makePaymentWriter();
      const logged: string[] = [];
      const fakeLog = { error: (_obj: unknown, msg: string) => { logged.push(msg); }, info: () => {}, warn: () => {}, debug: () => {} };
      const session = { payment_intent: "pi_em5", metadata: { token_paiement: "tok_connect_err", facture_id: "100", customer_email: "err@test.com", customer_name: "Test", numero_facture: "FAC-ERR", user_id: "1" } };
      const event: StripeWebhookEvent = { id: "evt_connect_em2", type: "checkout.session.completed", account: "acct_1", data: { object: session } };
      const result = await processConnectWebhook(
        { ...makeDeps(event, { paymentWriter }), log: fakeLog as never, onCheckoutCompletedEmail: async () => { throw new Error("SMTP error"); } },
        { rawBody: RAW, signature: SIG },
      );
      expect(result.http).toBe(200);
      expect(logged.some(m => m.includes("Email confirmation client paiement Connect"))).toBe(true);
    });
  });

  describe("payment_intent.payment_failed (direct charge Lot 4)", () => {
    it("marque le paiement échoué si paymentWriter fourni + token présent", async () => {
      const paymentWriter = makePaymentWriter();
      const pi = { id: "pi_fail_1", metadata: { token_paiement: "tok_fail" } };
      const event: StripeWebhookEvent = { id: "evt_live_11", type: "payment_intent.payment_failed", account: "acct_123", data: { object: pi } };
      const result = await processConnectWebhook(makeDeps(event, { paymentWriter }), { rawBody: RAW, signature: SIG });
      expect(result.http).toBe(200);
      expect(paymentWriter.resolvePaiement).toHaveBeenCalledWith("tok_fail");
      expect(paymentWriter.failPaiement).toHaveBeenCalledWith(expect.objectContaining({ artisanId: 7, paiementId: 1 }));
    });

    it("ignore si token_paiement absent (event billing abonnement)", async () => {
      const paymentWriter = makePaymentWriter();
      const event: StripeWebhookEvent = {
        id: "evt_live_12", type: "payment_intent.payment_failed", account: "acct_123",
        data: { object: { id: "pi_sub_1", metadata: {} } },
      };
      const result = await processConnectWebhook(makeDeps(event, { paymentWriter }), { rawBody: RAW, signature: SIG });
      expect(result.http).toBe(200);
      expect(paymentWriter.failPaiement).not.toHaveBeenCalled();
    });
  });
});
