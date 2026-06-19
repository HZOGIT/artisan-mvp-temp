import type { FastifyInstance } from "fastify";
import { ForbiddenError, NotFoundError } from "../../shared/errors";
import type { RateLimiterPort } from "../../shared/ports/rate-limiter";
import { getPortalDevisPdf, type PortalDevisPdfDeps } from "../../modules/paiement/application/portal-devis-pdf";
import { extractClientIp } from "./client-ip";

export interface PortailDevisPdfRouteDeps extends PortalDevisPdfDeps {
  readonly rateLimiter: RateLimiterPort;
}

/*
 * Route HORS-tRPC PUBLIQUE `GET /api/portail/:token/devis/:id/pdf` : PDF d'un devis depuis le portail
 * client (le token EST la capacité, pas de cookie). Rate-limit IP (anti-DoS PDF). 403 token invalide,
 * 404 devis hors clientId. ⚠️ MONTÉ mais NON routé tant qu'absent de MIGRATED_ROUTES.
 */
export function registerPortailDevisPdfRoute(app: FastifyInstance, deps: PortailDevisPdfRouteDeps): void {
  app.get("/api/portail/:token/devis/:id/pdf", async (req, reply) => {
    const ip = extractClientIp((req.headers ?? {}) as Record<string, unknown>, req.ip ?? null);
    if (!(await deps.rateLimiter.check(`portail-pdf:${ip}`))) {
      return reply.code(429).send({ error: "Trop de requêtes, réessayez dans une minute" });
    }

    const params = req.params as { token?: string; id?: string };
    const token = String(params.token ?? "");
    const id = Number(params.id);
    if (!token || !Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: "Requête invalide" });

    try {
      const { buffer, filename } = await getPortalDevisPdf(deps, token, id);
      req.log.info({ event: "portail_devis_pdf_viewed", devisId: id }, "PDF devis portail consulté par le client");
      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `inline; filename="${filename}"`)
        .send(buffer);
    } catch (e) {
      if (e instanceof ForbiddenError) {
        req.log.warn({ event: "portail_pdf_forbidden", devisId: id }, "Token portail invalide — accès refusé au PDF devis");
        return reply.code(403).send({ error: e.message });
      }
      if (e instanceof NotFoundError) return reply.code(404).send({ error: e.message });
      req.log.error({ event: "portail_pdf_error", document: "devis", devisId: id, err: e instanceof Error ? e : new Error(String(e)) }, "Erreur génération PDF devis portail");
      return reply.code(500).send({ error: "Erreur lors de la génération du PDF" });
    }
  });
}
