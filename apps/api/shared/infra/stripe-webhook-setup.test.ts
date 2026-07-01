import { describe, it, expect, vi } from "vitest";
import { ensureStripeWebhookEndpoint, ensureStripeConnectWebhookEndpoint, bootstrapStripeWebhooks } from "./stripe-webhook-setup";
import type { StripeWebhookSDK } from "./stripe-webhook-setup";
import type { AppLogger } from "../ports/logger";

/** Logger espion qui capture toutes les entrées ({obj, msg}) pour asserter l'absence de secret. */
function makeSpyLogger(): AppLogger & { entries: Array<{ obj: Record<string, unknown>; msg: string }> } {
  const entries: Array<{ obj: Record<string, unknown>; msg: string }> = [];
  const rec = (obj: Record<string, unknown>, msg: string): void => { entries.push({ obj, msg }); };
  return { entries, info: rec, warn: rec, error: rec, debug: rec };
}

/** Sérialise toutes les entrées de log en une chaîne — pour vérifier qu'un secret n'y apparaît jamais. */
const logDump = (log: { entries: Array<{ obj: Record<string, unknown>; msg: string }> }): string =>
  log.entries.map((e) => `${JSON.stringify(e.obj)} ${e.msg}`).join("\n");

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

  it("ne loggue JAMAIS le signing secret en clair à la création", async () => {
    const sdk = makeSDK([]);
    const log = makeSpyLogger();
    const result = await ensureStripeWebhookEndpoint("sk_test_key", URL, log, () => sdk);
    expect(result).toBe("whsec_newSecret");
    expect(logDump(log)).not.toContain("whsec_newSecret");
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

const CONNECT_EVENTS = ["account.updated", "account.application.deauthorized", "checkout.session.completed", "payment_intent.payment_failed"];
const CONNECT_URL = "https://example.com/api/stripe/connect-webhook";

const makeConnectSDK = (endpoints: Array<{ id: string; url: string; status: string; enabled_events: string[]; secret?: string }> = []): StripeWebhookSDK => ({
  webhookEndpoints: {
    list: vi.fn().mockResolvedValue({ data: endpoints }),
    create: vi.fn().mockResolvedValue({ id: "we_connect_new", url: CONNECT_URL, secret: "whsec_connectSecret" }),
    update: vi.fn().mockResolvedValue({ id: "we_connect_existing" }),
  },
});

describe("ensureStripeConnectWebhookEndpoint", () => {
  it("retourne null si STRIPE_SECRET_KEY absent (no-op)", async () => {
    const result = await ensureStripeConnectWebhookEndpoint("", CONNECT_URL);
    expect(result).toBeNull();
  });

  it("crée l'endpoint Connect avec connect=true et retourne le secret", async () => {
    const sdk = makeConnectSDK([]);
    const result = await ensureStripeConnectWebhookEndpoint("sk_test_key", CONNECT_URL, undefined, () => sdk);
    expect(sdk.webhookEndpoints.create).toHaveBeenCalledWith({
      url: CONNECT_URL,
      enabled_events: CONNECT_EVENTS,
      description: "Operioz Connect — auto-setup",
      connect: true,
    });
    expect(result).toBe("whsec_connectSecret");
  });

  it("retourne null si endpoint Connect existant avec tous les events (idempotent)", async () => {
    const sdk = makeConnectSDK([{ id: "we_connect_existing", url: CONNECT_URL, status: "enabled", enabled_events: CONNECT_EVENTS }]);
    const result = await ensureStripeConnectWebhookEndpoint("sk_test_key", CONNECT_URL, undefined, () => sdk);
    expect(sdk.webhookEndpoints.create).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("met à jour les events manquants sur l'endpoint Connect existant", async () => {
    const sdk = makeConnectSDK([{ id: "we_connect_existing", url: CONNECT_URL, status: "enabled", enabled_events: ["account.updated"] }]);
    const result = await ensureStripeConnectWebhookEndpoint("sk_test_key", CONNECT_URL, undefined, () => sdk);
    expect(sdk.webhookEndpoints.update).toHaveBeenCalledWith("we_connect_existing", { enabled_events: CONNECT_EVENTS });
    expect(result).toBeNull();
  });
});

describe("bootstrapStripeWebhooks", () => {
  const baseDeps = () => ({
    stripeKey: "sk_test_key",
    backendPublicUrl: "https://example.com",
    log: makeSpyLogger(),
    persistSecret: vi.fn<(key: string, value: string) => Promise<void>>().mockResolvedValue(undefined),
  });

  it("endpoint créé → persiste le secret via setSecret (clé + secret) + log 'recréé', sans throw ni secret en clair", async () => {
    const deps = baseDeps();
    await expect(
      bootstrapStripeWebhooks({
        ...deps,
        ensureWebhook: async () => "whsec_web",
        ensureConnectWebhook: async () => "whsec_connect",
      }),
    ).resolves.toBeUndefined();

    expect(deps.persistSecret).toHaveBeenCalledWith("STRIPE_WEBHOOK_SECRET", "whsec_web");
    expect(deps.persistSecret).toHaveBeenCalledWith("STRIPE_CONNECT_WEBHOOK_SECRET", "whsec_connect");
    const dump = logDump(deps.log);
    expect(dump).toContain("recréé et signing secret stocké dans le secrets manager");
    expect(dump).not.toContain("whsec_web");
    expect(dump).not.toContain("whsec_connect");
  });

  it("endpoints déjà présents (ensure* → null) → aucun setSecret, idempotent", async () => {
    const deps = baseDeps();
    await bootstrapStripeWebhooks({
      ...deps,
      ensureWebhook: async () => null,
      ensureConnectWebhook: async () => null,
    });
    expect(deps.persistSecret).not.toHaveBeenCalled();
  });

  it("passe backendPublicUrl → URLs webhook correctes vers ensure*", async () => {
    const deps = baseDeps();
    const ensureWebhook = vi.fn<(key: string, url: string) => Promise<string | null>>().mockResolvedValue(null);
    const ensureConnectWebhook = vi.fn<(key: string, url: string) => Promise<string | null>>().mockResolvedValue(null);
    await bootstrapStripeWebhooks({ ...deps, ensureWebhook, ensureConnectWebhook });
    expect(ensureWebhook).toHaveBeenCalledWith("sk_test_key", "https://example.com/api/stripe/webhook", deps.log);
    expect(ensureConnectWebhook).toHaveBeenCalledWith("sk_test_key", "https://example.com/api/stripe/connect-webhook", deps.log);
  });
});
