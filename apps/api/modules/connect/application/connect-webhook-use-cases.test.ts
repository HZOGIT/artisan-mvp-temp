import { describe, it, expect, vi } from "vitest";
import { processConnectWebhook } from "./connect-webhook-use-cases";
import type { ConnectWebhookDeps } from "./connect-webhook-use-cases";
import type { ConnectArtisanWriter } from "./connect-artisan-writer";
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

function makeDeps(event: StripeWebhookEvent | null, opts: { throwOnConstruct?: boolean; writer?: ConnectArtisanWriter } = {}): ConnectWebhookDeps {
  return {
    stripe: makeStripe(event, opts.throwOnConstruct),
    writer: opts.writer ?? makeWriter(),
    webhookSecret: "whsec_test",
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

  it("retourne 400 si signature invalide (constructEvent throw)", async () => {
    const result = await processConnectWebhook(makeDeps(null, { throwOnConstruct: true }), { rawBody: RAW, signature: SIG });
    expect(result.http).toBe(400);
    expect(result.body).toMatchObject({ error: "Webhook signature verification failed" });
  });

  it("retourne 200 sans toucher le writer pour evt_test_*", async () => {
    const writer = makeWriter();
    const event: StripeWebhookEvent = { id: "evt_test_123", type: "account.updated", account: "acct_1", data: { object: { id: "acct_1" } } };
    const result = await processConnectWebhook(makeDeps(event, { writer }), { rawBody: RAW, signature: SIG });
    expect(result.http).toBe(200);
    expect(result.body).toMatchObject({ verified: true });
    expect(writer.upsertConnectStatus).not.toHaveBeenCalled();
    expect(writer.resetConnectStatus).not.toHaveBeenCalled();
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
});
