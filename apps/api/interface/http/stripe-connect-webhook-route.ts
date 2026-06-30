import type { FastifyInstance } from "fastify";
import type { ConnectWebhookDeps } from "../../modules/connect/application/connect-webhook-use-cases";
import { processConnectWebhook } from "../../modules/connect/application/connect-webhook-use-cases";
import type { AppLogger } from "../../shared/ports/logger";

/*
 * Route HORS-tRPC `POST /api/stripe/connect-webhook`. Endpoint séparé (connect=true) avec son propre
 * signing secret `STRIPE_CONNECT_WEBHOOK_SECRET`. ⚠️ RAW BODY obligatoire : même contrainte que
 * /api/stripe/webhook — encapsulé dans un plugin Fastify pour isoler le parser Buffer.
 */
export function registerStripeConnectWebhookRoute(app: FastifyInstance, deps: ConnectWebhookDeps): void {
  app.register((instance) => {
    instance.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => done(null, body));
    instance.post("/api/stripe/connect-webhook", async (req, reply) => {
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === "string" ? req.body : "");
      const signature = req.headers["stripe-signature"] as string | undefined;
      const result = await processConnectWebhook({ ...deps, log: req.log as unknown as AppLogger }, { rawBody, signature });
      if (result.http >= 400) {
        req.log.error({ event: "stripe_connect_webhook_error", status: result.http, body: result.body }, "Connect webhook failed");
      } else {
        req.log.info({ event: "stripe_connect_webhook_processed", status: result.http }, "Connect webhook OK");
      }
      return reply.code(result.http).send(result.body);
    });
  });
}
