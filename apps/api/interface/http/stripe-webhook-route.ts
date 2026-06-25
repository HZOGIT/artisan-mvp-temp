import type { FastifyInstance } from "fastify";
import type { StripeWebhookDeps } from "../../modules/subscription/application/webhook-use-cases";
import { processStripeWebhook } from "../../modules/subscription/application/webhook-use-cases";
import type { AppLogger } from "../../shared/ports/logger";

/*
 * Route HORS-tRPC `POST /api/stripe/webhook`. ⚠️ **RAW BODY obligatoire** : la vérif de signature
 * (`constructEvent`) doit recevoir le corps brut exact (un JSON re-sérialisé invaliderait la signature).
 * On l'isole dans un scope Fastify encapsulé avec un content-type parser `Buffer` DÉDIÉ → le parser
 * JSON global (tRPC) n'est PAS impacté (les content-type parsers Fastify sont encapsulés par plugin).
 */
export function registerStripeWebhookRoute(app: FastifyInstance, deps: StripeWebhookDeps): void {
  app.register((instance) => {
    instance.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => done(null, body));
    instance.post("/api/stripe/webhook", async (req, reply) => {
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === "string" ? req.body : "");
      const signature = req.headers["stripe-signature"] as string | undefined;
      const result = await processStripeWebhook({ ...deps, log: req.log as unknown as AppLogger }, { rawBody, signature });
      if (result.http >= 400) {
        req.log.error({ event: "stripe_webhook_error", status: result.http, body: result.body }, "Stripe webhook failed");
      } else {
        req.log.info({ event: "stripe_webhook_processed", status: result.http }, "Stripe webhook OK");
      }
      return reply.code(result.http).send(result.body);
    });
  });
}
