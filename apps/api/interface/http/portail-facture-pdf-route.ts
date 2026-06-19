import type { FastifyInstance } from "fastify";
import { ForbiddenError, NotFoundError } from "../../shared/errors";
import type { RateLimiterPort } from "../../shared/ports/rate-limiter";
import { getPortalFacturePdf, type PortalFacturePdfDeps } from "../../modules/paiement/application/portal-facture-pdf";
import { extractClientIp } from "./client-ip";

export interface PortailFacturePdfRouteDeps extends PortalFacturePdfDeps {
  readonly rateLimiter: RateLimiterPort;
}

/*
 * Route HORS-tRPC PUBLIQUE `GET /api/portail/:token/factures/:id/pdf` : PDF d'une facture depuis le
 * portail client (token = capacité, rate-limit IP). 403 token invalide, 404 facture hors clientId.
 * ⚠️ MONTÉ mais NON routé tant qu'absent de MIGRATED_ROUTES.
 */
export function registerPortailFacturePdfRoute(app: FastifyInstance, deps: PortailFacturePdfRouteDeps): void {
  app.get("/api/portail/:token/factures/:id/pdf", async (req, reply) => {
    const ip = extractClientIp((req.headers ?? {}) as Record<string, unknown>, req.ip ?? null);
    if (!(await deps.rateLimiter.check(`portail-pdf:${ip}`))) {
      return reply.code(429).send({ error: "Trop de requêtes, réessayez dans une minute" });
    }

    const params = req.params as { token?: string; id?: string };
    const token = String(params.token ?? "");
    const id = Number(params.id);
    if (!token || !Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: "Requête invalide" });

    try {
      const { buffer, filename } = await getPortalFacturePdf(deps, token, id);
      req.log.info({ event: "portail_facture_pdf_viewed", factureId: id }, "PDF facture portail consulté par le client");
      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `inline; filename="${filename}"`)
        .send(buffer);
    } catch (e) {
      if (e instanceof ForbiddenError) {
        req.log.warn({ event: "portail_pdf_forbidden", factureId: id }, "Token portail invalide — accès refusé au PDF facture");
        return reply.code(403).send({ error: e.message });
      }
      if (e instanceof NotFoundError) return reply.code(404).send({ error: e.message });
      req.log.error({ event: "portail_pdf_error", document: "facture", factureId: id, err: e instanceof Error ? e : new Error(String(e)) }, "Erreur génération PDF facture portail");
      return reply.code(500).send({ error: "Erreur lors de la génération du PDF" });
    }
  });
}
