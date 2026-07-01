import type { FastifyInstance } from "fastify";
import type { SchedulerDeps } from "../../modules/billing/application/billing-scheduler";
import { runSchedulerTick } from "../../modules/billing/application/billing-scheduler";

/**
 * POST /internal/billing/tick — déclenche un tick du scheduler maison.
 * Sécurisé par le header `x-scheduler-secret` (Railway cron ou cron externe).
 * Ne pas exposer publiquement.
 */
export function registerBillingSchedulerRoute(app: FastifyInstance, deps: SchedulerDeps & { secret: () => string }): void {
  app.post("/internal/billing/tick", async (req, reply) => {
    const provided = (req.headers["x-scheduler-secret"] as string | undefined) ?? "";
    const expected = deps.secret();
    if (!expected || provided !== expected) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    try {
      const result = await runSchedulerTick(deps);
      req.log.info({ event: "billing_scheduler_tick", ...result }, "Billing scheduler tick completed");
      return reply.code(200).send(result);
    } catch (err) {
      req.log.error({ event: "billing_scheduler_tick_error", error: err instanceof Error ? err.message : String(err) }, "Billing scheduler tick failed");
      return reply.code(500).send({ error: "Scheduler tick failed" });
    }
  });
}
