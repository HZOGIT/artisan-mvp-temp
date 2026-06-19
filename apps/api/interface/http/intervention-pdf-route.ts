import type { FastifyInstance } from "fastify";
import { NotFoundError } from "../../shared/errors";
import { getInterventionPdf, type InterventionPdfDeps } from "../../modules/interventions/application/intervention-pdf";
import { authArtisanFromCookie, type CookieAuthDeps } from "./cookie-auth";

export interface InterventionPdfRouteDeps extends CookieAuthDeps, InterventionPdfDeps {}

/*
 * Route HORS-tRPC `GET /api/interventions/:id/bon-pdf` : télécharge le bon d'intervention en PDF (auth
 * cookie JWT). 404 anti-IDOR si l'intervention n'appartient pas au tenant. ⚠️ MONTÉ mais NON routé tant
 * qu'absent de MIGRATED_ROUTES.
 */
export function registerInterventionPdfRoute(app: FastifyInstance, deps: InterventionPdfRouteDeps): void {
  app.get("/api/interventions/:id/bon-pdf", async (req, reply) => {
    const auth = await authArtisanFromCookie(req, deps);
    if (auth.status === "unauthenticated") return reply.code(401).send({ error: "Non authentifié" });
    if (auth.status === "no-artisan") return reply.code(404).send({ error: "Artisan non trouvé" });

    const id = Number((req.params as { id?: string }).id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: "id invalide" });

    try {
      const { buffer, filename } = await getInterventionPdf(deps, { artisanId: auth.artisanId, userId: auth.userId }, id);
      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `inline; filename="${filename}"`)
        .send(buffer);
    } catch (e) {
      if (e instanceof NotFoundError) return reply.code(404).send({ error: e.message });
      return reply.code(500).send({ error: "Erreur lors de la génération du PDF" });
    }
  });
}
