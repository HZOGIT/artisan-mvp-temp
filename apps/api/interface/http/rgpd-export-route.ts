import type { FastifyInstance } from "fastify";
import { RgpdExportReaderDrizzle } from "../../shared/readers/rgpd-export-reader-drizzle";
import { zipEntries } from "../../shared/zip/zip-entries";
import { authArtisanFromCookie, type CookieAuthDeps } from "./cookie-auth";
import type { DbClient } from "../../shared/db/client";

export interface RgpdExportDeps extends CookieAuthDeps {
  readonly db: DbClient;
}

/**
 * Route `GET /api/rgpd/export` — portabilité RGPD (Art. 20). Renvoie un ZIP contenant
 * `export-donnees.json` avec l'intégralité des données du compte (profil, clients, devis,
 * factures, interventions, dépenses…). Protégée par cookie d'auth JWT.
 */
export function registerRgpdExportRoute(app: FastifyInstance, deps: RgpdExportDeps): void {
  app.get("/api/rgpd/export", async (req, reply) => {
    const auth = await authArtisanFromCookie(req, deps);
    if (auth.status === "unauthenticated") return reply.code(401).send({ error: "Non authentifié" });
    if (auth.status === "no-artisan") return reply.code(404).send({ error: "Compte artisan introuvable" });

    const reader = new RgpdExportReaderDrizzle(deps.db);
    let data;
    try {
      data = await reader.read(auth.artisanId, auth.userId);
    } catch (e) {
      req.log.error({ event: "rgpd_export_error", artisanId: auth.artisanId, err: e instanceof Error ? e : new Error(String(e)) }, "Erreur export RGPD");
      return reply.code(500).send({ error: "Erreur lors de la génération de l'export" });
    }

    const json = JSON.stringify(data, null, 2);
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const zip = await zipEntries([{ name: "export-donnees.json", content: json }]);

    req.log.info({ event: "rgpd_export_generated", artisanId: auth.artisanId }, "Export RGPD généré");

    return reply
      .header("Content-Type", "application/zip")
      .header("Content-Disposition", `attachment; filename="export-donnees-${date}.zip"`)
      .send(zip);
  });
}
