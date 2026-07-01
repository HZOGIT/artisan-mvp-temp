import type { AppLogger } from "../ports/logger";

const STRIPE_MODULE = "stripe";

const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.trial_will_end",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
] as const;

const CONNECT_WEBHOOK_EVENTS = [
  "account.updated",
  "account.application.deauthorized",
  "checkout.session.completed",
  "payment_intent.payment_failed",
] as const;

type StripeWebhookEndpoints = {
  list(params: { limit: number }): Promise<{
    data: Array<{
      id: string;
      url: string;
      status: string;
      enabled_events: string[];
      secret?: string;
    }>;
  }>;
  create(params: { url: string; enabled_events: string[]; description?: string; connect?: boolean }): Promise<{
    id: string;
    url: string;
    secret?: string;
  }>;
  update(id: string, params: { enabled_events: string[] }): Promise<{ id: string }>;
};

export type StripeWebhookSDK = { webhookEndpoints: StripeWebhookEndpoints };
export type StripeSdkFactory = (key: string) => StripeWebhookSDK;

function isAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  return (
    lower.includes("authentication") ||
    lower.includes("invalid api key") ||
    lower.includes("no such api key") ||
    lower.includes("api_key_expired")
  );
}

async function withStripeRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (isAuthError(err)) throw err;
      lastErr = err;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function loadSdk(secretKey: string, factory?: StripeSdkFactory): Promise<StripeWebhookSDK | null> {
  try {
    if (factory) return factory(secretKey);
    const mod = (await import(STRIPE_MODULE)) as { default: new (key: string) => StripeWebhookSDK };
    return new mod.default(secretKey);
  } catch {
    /* ponytail: best-effort — module Stripe indisponible → null */
    return null;
  }
}

/**
 * S'assure qu'un webhook Stripe pointe vers `webhookUrl` avec les bons events.
 *
 * Retourne `null` si l'endpoint existait déjà (STRIPE_WEBHOOK_SECRET en env suffit).
 * Retourne le signing secret si un NOUVEL endpoint est créé — à stocker dans STRIPE_WEBHOOK_SECRET.
 *
 * Idempotent. Fail-closed si STRIPE_SECRET_KEY est présent mais Stripe refuse après retries.
 * Si STRIPE_SECRET_KEY absent (env de test), retourne null sans throw.
 *
 * @param sdkFactory Injecté en test uniquement — remplace le import dynamique Stripe.
 */
export async function ensureStripeWebhookEndpoint(
  secretKey: string,
  webhookUrl: string,
  log?: AppLogger,
  sdkFactory?: StripeSdkFactory,
): Promise<string | null> {
  if (!secretKey) {
    log?.warn({ event: "stripe_webhook_setup_skip" }, "STRIPE_SECRET_KEY absent — auto-setup webhook ignoré");
    return null;
  }

  const sdk = await loadSdk(secretKey, sdkFactory);
  if (!sdk) {
    log?.warn({ event: "stripe_webhook_setup_skip" }, "Module Stripe non disponible — auto-setup webhook ignoré");
    return null;
  }

  const events = [...WEBHOOK_EVENTS] as string[];

  const list = await withStripeRetry(() => sdk.webhookEndpoints.list({ limit: 50 }));
  const existing = list.data.find((w) => w.url === webhookUrl);

  if (existing) {
    const missing = events.filter((e) => !existing.enabled_events.includes(e));
    const hasAll = existing.enabled_events.includes("*") || missing.length === 0;
    if (!hasAll) {
      await withStripeRetry(() => sdk.webhookEndpoints.update(existing.id, { enabled_events: events }));
      log?.info({ event: "stripe_webhook_updated", id: existing.id, url: webhookUrl, added: missing }, `Webhook Stripe mis à jour (${missing.join(", ")} ajouté)`);
    } else {
      log?.info({ event: "stripe_webhook_ok", id: existing.id, url: webhookUrl }, "Webhook Stripe déjà configuré");
    }
    return null;
  }

  const created = await withStripeRetry(() =>
    sdk.webhookEndpoints.create({ url: webhookUrl, enabled_events: events, description: "Operioz — auto-setup" }),
  );
  const newSecret = created.secret ?? null;
  log?.info(
    { event: "stripe_webhook_created", id: created.id, url: webhookUrl },
    "Webhook Stripe créé — signing secret persisté par l'appelant dans le secrets manager",
  );
  return newSecret;
}

/**
 * S'assure qu'un webhook Stripe Connect (`connect=true`) pointe vers `connectWebhookUrl`.
 *
 * Même sémantique qu'`ensureStripeWebhookEndpoint` : idempotent, fail-closed, secret retourné
 * uniquement à la création → à stocker dans STRIPE_CONNECT_WEBHOOK_SECRET.
 */
export async function ensureStripeConnectWebhookEndpoint(
  secretKey: string,
  connectWebhookUrl: string,
  log?: AppLogger,
  sdkFactory?: StripeSdkFactory,
): Promise<string | null> {
  if (!secretKey) {
    log?.warn({ event: "stripe_connect_webhook_setup_skip" }, "STRIPE_SECRET_KEY absent — auto-setup Connect webhook ignoré");
    return null;
  }

  const sdk = await loadSdk(secretKey, sdkFactory);
  if (!sdk) {
    log?.warn({ event: "stripe_connect_webhook_setup_skip" }, "Module Stripe non disponible — auto-setup Connect webhook ignoré");
    return null;
  }

  const events = [...CONNECT_WEBHOOK_EVENTS] as string[];

  const list = await withStripeRetry(() => sdk.webhookEndpoints.list({ limit: 50 }));
  const existing = list.data.find((w) => w.url === connectWebhookUrl);

  if (existing) {
    const missing = events.filter((e) => !existing.enabled_events.includes(e));
    const hasAll = existing.enabled_events.includes("*") || missing.length === 0;
    if (!hasAll) {
      await withStripeRetry(() => sdk.webhookEndpoints.update(existing.id, { enabled_events: events }));
      log?.info({ event: "stripe_connect_webhook_updated", id: existing.id, url: connectWebhookUrl, added: missing }, `Webhook Connect mis à jour (${missing.join(", ")} ajouté)`);
    } else {
      log?.info({ event: "stripe_connect_webhook_ok", id: existing.id, url: connectWebhookUrl }, "Webhook Connect déjà configuré");
    }
    return null;
  }

  const created = await withStripeRetry(() =>
    sdk.webhookEndpoints.create({ url: connectWebhookUrl, enabled_events: events, description: "Operioz Connect — auto-setup", connect: true }),
  );
  const newSecret = created.secret ?? null;
  log?.info(
    { event: "stripe_connect_webhook_created", id: created.id, url: connectWebhookUrl },
    "Webhook Connect créé — signing secret persisté par l'appelant dans le secrets manager",
  );
  return newSecret;
}

type EnsureWebhook = (secretKey: string, url: string, log?: AppLogger) => Promise<string | null>;

export interface BootstrapStripeWebhooksDeps {
  readonly stripeKey: string;
  readonly backendPublicUrl: string;
  readonly log: AppLogger;
  /** Persiste un signing secret dans le provider actif (write-through cache). Injecté = setSecret. */
  readonly persistSecret: (key: string, value: string) => Promise<void>;
  readonly ensureWebhook: EnsureWebhook;
  readonly ensureConnectWebhook: EnsureWebhook;
}

/**
 * Auto-setup des deux webhooks Stripe au boot. Idempotent : si un endpoint existe déjà, `ensure*`
 * renvoie `null` → rien à faire. Si un endpoint est CRÉÉ, `ensure*` renvoie son signing secret → on
 * le PERSISTE via `persistSecret` (provider actif + write-through cache), sans throw et sans jamais
 * logguer le secret en clair. Grâce au write-through, la route runtime lit le nouveau secret dès ce
 * boot (pas de 2e déploiement).
 */
export async function bootstrapStripeWebhooks(deps: BootstrapStripeWebhooksDeps): Promise<void> {
  const webhookUrl = `${deps.backendPublicUrl}/api/stripe/webhook`;
  const newSecret = await deps.ensureWebhook(deps.stripeKey, webhookUrl, deps.log);
  if (newSecret) {
    await deps.persistSecret("STRIPE_WEBHOOK_SECRET", newSecret);
    deps.log.warn({ event: "stripe_webhook_recreated" }, "Webhook Stripe recréé et signing secret stocké dans le secrets manager");
  }

  const connectWebhookUrl = `${deps.backendPublicUrl}/api/stripe/connect-webhook`;
  const newConnectSecret = await deps.ensureConnectWebhook(deps.stripeKey, connectWebhookUrl, deps.log);
  if (newConnectSecret) {
    await deps.persistSecret("STRIPE_CONNECT_WEBHOOK_SECRET", newConnectSecret);
    deps.log.warn({ event: "stripe_connect_webhook_recreated" }, "Webhook Connect Stripe recréé et signing secret stocké dans le secrets manager");
  }
}
