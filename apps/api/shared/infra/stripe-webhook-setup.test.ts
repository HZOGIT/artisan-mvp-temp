import { describe, it, expect, vi } from "vitest";
import { ensureStripeWebhookEndpoint } from "./stripe-webhook-setup";
import type { StripeWebhookSDK } from "./stripe-webhook-setup";

const EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.trial_will_end",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
];

const makeSDK = (endpoints: Array<{ id: string; url: string; status: string; enabled_events: string[]; secret?: string }> = []): StripeWebhookSDK => ({
  webhookEndpoints: {
    list: vi.fn().mockResolvedValue({ data: endpoints }),
    create: vi.fn().mockResolvedValue({ id: "we_new", url: "https://example.com/api/stripe/webhook", secret: "whsec_newSecret" }),
    update: vi.fn().mockResolvedValue({ id: "we_existing" }),
  },
});

const URL = "https://example.com/api/stripe/webhook";

describe("ensureStripeWebhookEndpoint", () => {
  it("retourne null si STRIPE_SECRET_KEY absent (no-op)", async () => {
    const result = await ensureStripeWebhookEndpoint("", URL);
    expect(result).toBeNull();
  });

  it("crée l'endpoint absent et retourne le nouveau secret", async () => {
    const sdk = makeSDK([]);
    const result = await ensureStripeWebhookEndpoint("sk_test_key", URL, undefined, () => sdk);

    expect(sdk.webhookEndpoints.create).toHaveBeenCalledWith({
      url: URL,
      enabled_events: EVENTS,
      description: "Operioz — auto-setup",
    });
    expect(result).toBe("whsec_newSecret");
  });

  it("retourne null si endpoint existant avec tous les events (idempotent)", async () => {
    const sdk = makeSDK([{ id: "we_existing", url: URL, status: "enabled", enabled_events: EVENTS }]);
    const result = await ensureStripeWebhookEndpoint("sk_test_key", URL, undefined, () => sdk);

    expect(sdk.webhookEndpoints.create).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("met à jour les events manquants sur un endpoint existant incomplet", async () => {
    const sdk = makeSDK([{ id: "we_existing", url: URL, status: "enabled", enabled_events: ["payment_intent.succeeded"] }]);
    const result = await ensureStripeWebhookEndpoint("sk_test_key", URL, undefined, () => sdk);

    expect(sdk.webhookEndpoints.update).toHaveBeenCalledWith("we_existing", { enabled_events: EVENTS });
    expect(result).toBeNull();
  });

  it("throw immédiatement sur erreur d'authentification (pas de retry)", async () => {
    const sdk: StripeWebhookSDK = {
      webhookEndpoints: {
        list: vi.fn().mockRejectedValue(new Error("No such API key provided")),
        create: vi.fn(),
        update: vi.fn(),
      },
    };
    await expect(
      ensureStripeWebhookEndpoint("sk_test_invalid", URL, undefined, () => sdk),
    ).rejects.toThrow("No such API key");
    expect(sdk.webhookEndpoints.list).toHaveBeenCalledTimes(1);
  });

  it("retente 3 fois sur erreur transitoire puis throw", async () => {
    const sdk: StripeWebhookSDK = {
      webhookEndpoints: {
        list: vi.fn().mockRejectedValue(new Error("network error")),
        create: vi.fn(),
        update: vi.fn(),
      },
    };
    vi.useFakeTimers();
    const caught: unknown[] = [];
    const promise = ensureStripeWebhookEndpoint("sk_test_key", URL, undefined, () => sdk).catch((e) => { caught.push(e); });
    await vi.runAllTimersAsync();
    await promise;
    expect(caught).toHaveLength(1);
    expect((caught[0] as Error).message).toBe("network error");
    expect(sdk.webhookEndpoints.list).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});
