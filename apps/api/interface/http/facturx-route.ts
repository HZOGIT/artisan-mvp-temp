import type { FastifyInstance } from "fastify";
import { NotFoundError } from "../../shared/errors";
import { getFacturxXml, getFacturxPdf, type FacturxPdfDeps } from "../../modules/comptabilite/application/facturx-use-cases";
import { authArtisanFromCookie, type CookieAuthDeps } from "./cookie-auth";

export interface FacturxRouteDeps extends CookieAuthDeps, FacturxPdfDeps {}

/*
 * Routes HORS-tRPC Factur-X (auth cookie JWT) : `GET /api/comptabilite/facturx-xml/:factureId` (XML CII)
 * + `GET /api/comptabilite/facturx/:factureId` (PDF facture, filename Factur-X). 404 anti-IDOR. ⚠️ MONTÉES
 * mais NON routées tant qu'absentes de MIGRATED_ROUTES.
 */
export function registerFacturxRoutes(app: FastifyInstance, deps: FacturxRouteDeps): void {
  app.get("/api/comptabilite/facturx-xml/:factureId", async (req, reply) => {
    const auth = await authArtisanFromCookie(req, deps);
    if (auth.status === "unauthenticated") return reply.code(401).send({ error: "Non authentifié" });
    if (auth.status === "no-artisan") return reply.code(404).send({ error: "Artisan non trouvé" });
    const id = Number((req.params as { factureId?: string }).factureId);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: "id invalide" });
    try {
      const { xml, filename } = await getFacturxXml(deps, { artisanId: auth.artisanId, userId: auth.userId }, id);
      return reply.header("Content-Type", "application/xml; charset=utf-8").header("Content-Disposition", `attachment; filename="${filename}"`).send(xml);
    } catch (e) {
      if (e instanceof NotFoundError) return reply.code(404).send({ error: e.message });
      return reply.code(500).send({ error: "Erreur lors de la génération du XML Factur-X" });
    }
  });

  app.get("/api/comptabilite/facturx/:factureId", async (req, reply) => {
    const auth = await authArtisanFromCookie(req, deps);
    if (auth.status === "unauthenticated") return reply.code(401).send({ error: "Non authentifié" });
    if (auth.status === "no-artisan") return reply.code(404).send({ error: "Artisan non trouvé" });
    const id = Number((req.params as { factureId?: string }).factureId);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: "id invalide" });
    try {
      const { buffer, filename } = await getFacturxPdf(deps, { artisanId: auth.artisanId, userId: auth.userId }, id);
      return reply.header("Content-Type", "application/pdf").header("Content-Disposition", `attachment; filename="${filename}"`).send(buffer);
    } catch (e) {
      if (e instanceof NotFoundError) return reply.code(404).send({ error: e.message });
      return reply.code(500).send({ error: "Erreur lors de la génération Factur-X" });
    }
  });
}
