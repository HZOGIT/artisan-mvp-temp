import type { FastifyInstance } from "fastify";
import { NotFoundError } from "../../shared/errors";
import { getBonCommandePdf, type BonCommandePdfDeps } from "../../modules/commandes/application/bon-commande-pdf";
import { authArtisanFromCookie, type CookieAuthDeps } from "./cookie-auth";

export interface CommandePdfRouteDeps extends CookieAuthDeps, BonCommandePdfDeps {}

/*
 * Route HORS-tRPC `GET /api/commandes-fournisseurs/:id/pdf` : télécharge le PDF d'un bon de commande
 * (auth cookie JWT). 404 anti-IDOR si la commande/fournisseur n'appartient pas au tenant. ⚠️ MONTÉ mais
 * NON routé tant qu'absent de MIGRATED_ROUTES (le legacy sert encore).
 */
export function registerCommandePdfRoute(app: FastifyInstance, deps: CommandePdfRouteDeps): void {
  app.get("/api/commandes-fournisseurs/:id/pdf", async (req, reply) => {
    const auth = await authArtisanFromCookie(req, deps);
    if (auth.status === "unauthenticated") return reply.code(401).send({ error: "Non authentifié" });
    if (auth.status === "no-artisan") return reply.code(404).send({ error: "Artisan non trouvé" });

    const id = Number((req.params as { id?: string }).id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: "id invalide" });

    try {
      const { buffer, filename } = await getBonCommandePdf(deps, { artisanId: auth.artisanId, userId: auth.userId }, id);
      req.log.info({ event: "commande_pdf_generated", commandeId: id, artisanId: auth.artisanId }, "PDF commande généré");
      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `inline; filename="${filename}"`)
        .send(buffer);
    } catch (e) {
      if (e instanceof NotFoundError) {
        req.log.warn({ event: "commande_pdf_not_found", commandeId: id, artisanId: auth.artisanId }, e.message);
        return reply.code(404).send({ error: e.message });
      }
      req.log.error({ event: "commande_pdf_error", commandeId: id, artisanId: auth.artisanId, err: e instanceof Error ? e : new Error(String(e)) }, "Erreur génération PDF commande");
      return reply.code(500).send({ error: "Erreur lors de la génération du PDF" });
    }
  });
}
