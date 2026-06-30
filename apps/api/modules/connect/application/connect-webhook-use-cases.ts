import type { StripePort } from "../../../shared/ports/stripe";
import type { AppLogger } from "../../../shared/ports/logger";
import type { ConnectArtisanWriter } from "./connect-artisan-writer";

export interface ConnectWebhookDeps {
  readonly stripe: StripePort;
  /** Implémentation Drizzle (owner pool) injectée depuis app.ts. */
  readonly writer: ConnectArtisanWriter;
  readonly webhookSecret: string;
  readonly log?: AppLogger;
}

export interface ConnectWebhookResult {
  readonly http: number;
  readonly body: Record<string, unknown>;
}

export async function processConnectWebhook(
  deps: ConnectWebhookDeps,
  input: { rawBody: Buffer; signature: string | undefined },
): Promise<ConnectWebhookResult> {
  if (!input.signature) return { http: 400, body: { error: "Missing signature" } };
  if (!deps.webhookSecret) return { http: 500, body: { error: "Webhook not configured" } };

  let event;
  try {
    event = await deps.stripe.constructEvent(input.rawBody, input.signature, deps.webhookSecret);
  } catch {
    return { http: 400, body: { error: "Webhook signature verification failed" } };
  }

  if (event.id.startsWith("evt_test_")) return { http: 200, body: { verified: true } };

  deps.log?.info({ event: "stripe_connect_webhook_received", stripeEvent: event.type, eventId: event.id, accountId: event.account }, `Connect webhook: ${event.type}`);

  try {
    if (event.type === "account.updated") {
      /* event.account et data.object.id portent tous deux l'account ID pour account.updated */
      const acctId = event.account ?? (typeof event.data.object["id"] === "string" ? event.data.object["id"] : null);
      if (acctId) await deps.writer.upsertConnectStatus(acctId, event.data.object);
    } else if (event.type === "account.application.deauthorized") {
      /* Pour deauthorized, event.account est la seule source fiable de l'account ID */
      if (event.account) await deps.writer.resetConnectStatus(event.account);
    }
  } catch (err) {
    deps.log?.error({ event: "stripe_connect_webhook_error", stripeEvent: event.type, error: err instanceof Error ? err.message : String(err) }, "Connect webhook handler error");
    return { http: 500, body: { error: "Internal error" } };
  }

  return { http: 200, body: { received: true } };
}
