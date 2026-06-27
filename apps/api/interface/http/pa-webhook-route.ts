import type { FastifyInstance } from "fastify";
import type { PaWebhookDeps } from "../../modules/einvoicing/application/webhook-use-cases";
import { processPaWebhook } from "../../modules/einvoicing/application/webhook-use-cases";
import type { AppLogger } from "../../shared/ports/logger";

/**
 * Route HORS-tRPC `POST /api/einvoicing/webhook`. ⚠️ RAW BODY obligatoire : même pattern
 * que le webhook Stripe — le parser JSON global ne doit pas toucher le corps brut.
 */
export function registerPaWebhookRoute(app: FastifyInstance, deps: PaWebhookDeps): void {
  app.register((instance) => {
    instance.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => done(null, body));
    instance.post("/api/einvoicing/webhook", async (req, reply) => {
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === "string" ? req.body : "");
      const signature = req.headers["x-pa-signature"] as string | undefined;
      const result = await processPaWebhook({ ...deps, log: req.log as unknown as AppLogger }, { rawBody, signature });
      if (result.http >= 400) {
        req.log.error({ event: "pa_webhook_error", status: result.http }, "PA webhook failed");
      } else {
        req.log.info({ event: "pa_webhook_processed", status: result.http }, "PA webhook OK");
      }
      return reply.code(result.http).send(result.body);
    });
  });
}
