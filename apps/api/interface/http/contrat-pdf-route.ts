import type { FastifyInstance } from "fastify";
import { NotFoundError } from "../../shared/errors";
import { getContratPdf, type ContratPdfDeps } from "../../modules/contrats-maintenance/application/contrat-pdf";
import { authArtisanFromCookie, type CookieAuthDeps } from "./cookie-auth";

export interface ContratPdfRouteDeps extends CookieAuthDeps, ContratPdfDeps {}

/*
 * Route HORS-tRPC `GET /api/contrats/:id/pdf` : télécharge le PDF d'un contrat de maintenance (auth
 * cookie JWT). 404 anti-IDOR si le contrat n'appartient pas au tenant. ⚠️ MONTÉ mais NON routé tant
 * qu'absent de MIGRATED_ROUTES.
 */
export function registerContratPdfRoute(app: FastifyInstance, deps: ContratPdfRouteDeps): void {
  app.get("/api/contrats/:id/pdf", async (req, reply) => {
    const auth = await authArtisanFromCookie(req, deps);
    if (auth.status === "unauthenticated") return reply.code(401).send({ error: "Non authentifié" });
    if (auth.status === "no-artisan") return reply.code(404).send({ error: "Artisan non trouvé" });

    const id = Number((req.params as { id?: string }).id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: "id invalide" });

    try {
      const { buffer, filename } = await getContratPdf(deps, { artisanId: auth.artisanId, userId: auth.userId }, id);
      req.log.info({ event: "contrat_pdf_generated", contratId: id, artisanId: auth.artisanId }, "PDF contrat généré");
      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `inline; filename="${filename}"`)
        .send(buffer);
    } catch (e) {
      if (e instanceof NotFoundError) {
        req.log.warn({ event: "contrat_pdf_not_found", contratId: id, artisanId: auth.artisanId }, e.message);
        return reply.code(404).send({ error: e.message });
      }
      req.log.error({ event: "contrat_pdf_error", contratId: id, artisanId: auth.artisanId, err: e instanceof Error ? e : new Error(String(e)) }, "Erreur génération PDF contrat");
      return reply.code(500).send({ error: "Erreur lors de la génération du PDF" });
    }
  });
}
