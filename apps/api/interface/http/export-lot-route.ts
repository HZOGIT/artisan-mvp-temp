import type { FastifyInstance } from "fastify";
import { NotFoundError } from "../../shared/errors";
import { collectFacturxLot, collectFacturePdfLot, type ExportLotPdfDeps } from "../../modules/comptabilite/application/export-lot-use-cases";
import { zipEntries } from "../../shared/zip/zip-entries";
import { authArtisanFromCookie, type CookieAuthDeps } from "./cookie-auth";

export interface ExportLotRouteDeps extends CookieAuthDeps, ExportLotPdfDeps {}

/** Parse une date de query (YYYY-MM-DD ou ISO) ; undefined si absente/invalide. */
function parseDate(v: unknown): Date | undefined {
  if (typeof v !== "string" || !v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/*
 * Routes HORS-tRPC d'export en LOT (auth cookie JWT) : `GET /api/comptabilite/export-facturx-lot`
 * (ZIP des XML CII de la période) + `GET /api/comptabilite/export-pdf-lot` (ZIP des PDF facture).
 * 404 si aucune facture sur la période (parité legacy). ⚠️ MONTÉES mais NON routées tant qu'absentes
 * de MIGRATED_ROUTES.
 */
export function registerExportLotRoutes(app: FastifyInstance, deps: ExportLotRouteDeps): void {
  app.get("/api/comptabilite/export-facturx-lot", async (req, reply) => {
    const auth = await authArtisanFromCookie(req, deps);
    if (auth.status === "unauthenticated") return reply.code(401).send({ error: "Non authentifié" });
    if (auth.status === "no-artisan") return reply.code(404).send({ error: "Artisan non trouvé" });
    const q = (req.query ?? {}) as Record<string, unknown>;
    try {
      const { entries, filename } = await collectFacturxLot(deps, { artisanId: auth.artisanId, userId: auth.userId }, { dateDebut: parseDate(q.dateDebut), dateFin: parseDate(q.dateFin) });
      const zip = await zipEntries(entries);
      req.log.info({ artisanId: auth.artisanId, nbDocuments: entries.length }, 'lot_export_generated');
      return reply.header("Content-Type", "application/zip").header("Content-Disposition", `attachment; filename="${filename}"`).send(zip);
    } catch (e) {
      req.log.error({ artisanId: auth.artisanId, err: e instanceof Error ? e : new Error(String(e)) }, 'lot_export_error');
      if (e instanceof NotFoundError) return reply.code(404).send({ error: e.message });
      return reply.code(500).send({ error: "Erreur lors de l'export Factur-X en lot" });
    }
  });

  app.get("/api/comptabilite/export-pdf-lot", async (req, reply) => {
    const auth = await authArtisanFromCookie(req, deps);
    if (auth.status === "unauthenticated") return reply.code(401).send({ error: "Non authentifié" });
    if (auth.status === "no-artisan") return reply.code(404).send({ error: "Artisan non trouvé" });
    const q = (req.query ?? {}) as Record<string, unknown>;
    try {
      const { entries, filename } = await collectFacturePdfLot(deps, { artisanId: auth.artisanId, userId: auth.userId }, { dateDebut: parseDate(q.dateDebut), dateFin: parseDate(q.dateFin) });
      const zip = await zipEntries(entries);
      req.log.info({ artisanId: auth.artisanId, nbDocuments: entries.length }, 'lot_export_generated');
      return reply.header("Content-Type", "application/zip").header("Content-Disposition", `attachment; filename="${filename}"`).send(zip);
    } catch (e) {
      req.log.error({ artisanId: auth.artisanId, err: e instanceof Error ? e : new Error(String(e)) }, 'lot_export_error');
      if (e instanceof NotFoundError) return reply.code(404).send({ error: e.message });
      return reply.code(500).send({ error: "Erreur lors de l'export PDF en lot" });
    }
  });
}
