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

type StripeSDK = {
  webhookEndpoints: {
    list(params: { limit: number }): Promise<{
      data: Array<{
        id: string;
        url: string;
        status: string;
        enabled_events: string[];
        secret?: string;
      }>;
    }>;
    create(params: { url: string; enabled_events: string[]; description?: string }): Promise<{
      id: string;
      url: string;
      secret?: string;
    }>;
    update(id: string, params: { enabled_events: string[] }): Promise<{ id: string }>;
  };
};

/**
 * S'assure qu'un webhook Stripe pointe vers `webhookUrl` avec les bons events.
 * Retourne le secret du webhook si un NOUVEAU endpoint est créé (à stocker dans STRIPE_WEBHOOK_SECRET).
 * Idempotent : ne fait rien si l'endpoint existe déjà avec les bons events.
 */
export async function ensureStripeWebhookEndpoint(
  secretKey: string,
  webhookUrl: string,
  log?: AppLogger,
): Promise<void> {
  if (!secretKey) {
    log?.warn({ event: "stripe_webhook_setup_skip" }, "STRIPE_SECRET_KEY absent — auto-setup webhook ignoré");
    return;
  }

  let sdk: StripeSDK;
  try {
    const mod = (await import(STRIPE_MODULE)) as { default: new (key: string) => StripeSDK };
    sdk = new mod.default(secretKey);
  } catch {
    log?.warn({ event: "stripe_webhook_setup_skip" }, "Module Stripe non disponible — auto-setup webhook ignoré");
    return;
  }

  const events = [...WEBHOOK_EVENTS] as string[];

  try {
    const list = await sdk.webhookEndpoints.list({ limit: 50 });
    const existing = list.data.find((w) => w.url === webhookUrl);

    if (existing) {
      const missing = events.filter((e) => !existing.enabled_events.includes(e));
      const hasAll = existing.enabled_events.includes("*") || missing.length === 0;
      if (!hasAll) {
        await sdk.webhookEndpoints.update(existing.id, { enabled_events: events });
        log?.info({ event: "stripe_webhook_updated", id: existing.id, url: webhookUrl, added: missing }, `Webhook Stripe mis à jour (${missing.join(", ")} ajouté)`);
      } else {
        log?.info({ event: "stripe_webhook_ok", id: existing.id, url: webhookUrl }, "Webhook Stripe déjà configuré");
      }
      return;
    }

    const created = await sdk.webhookEndpoints.create({ url: webhookUrl, enabled_events: events, description: "Operioz — auto-setup" });
    log?.warn(
      { event: "stripe_webhook_created", id: created.id, url: webhookUrl },
      `Webhook Stripe créé. ⚠️ Copiez ce secret dans STRIPE_WEBHOOK_SECRET : ${created.secret ?? "(secret non retourné)"}`,
    );
  } catch (e) {
    log?.warn({ event: "stripe_webhook_setup_error", error: e instanceof Error ? e.message : String(e) }, "Auto-setup webhook Stripe échoué (non bloquant)");
  }
}
