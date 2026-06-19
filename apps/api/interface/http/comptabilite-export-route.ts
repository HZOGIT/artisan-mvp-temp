import type { FastifyInstance } from "fastify";
import type { IComptabiliteReader } from "../../modules/comptabilite/application/comptabilite-reader";
import type { FacturesCsvReader } from "../../modules/comptabilite/application/factures-csv-reader";
import { getFecExport, getFacturesCsvExport } from "../../modules/comptabilite/application/use-cases";
import { authArtisanFromCookie, type CookieAuthDeps } from "./cookie-auth";

export interface ComptaExportDeps extends CookieAuthDeps {
  readonly reader: IComptabiliteReader;
  readonly csvReader: FacturesCsvReader;
}

/** Parse une date de query (YYYY-MM-DD ou ISO) ; undefined si absente/invalide. */
function parseDate(v: unknown): Date | undefined {
  if (typeof v !== "string" || !v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/*
 * Route HORS-tRPC `GET /api/comptabilite/fec` (export FEC opposable, auth cookie JWT). Réutilise le
 * générateur FEC PUR déjà porté (`buildFec`, invariant Σdébit=Σcrédit). Renvoie un fichier texte
 * téléchargeable (BOM UTF-8 pour les outils comptables DGFiP) + en-têtes de conformité.
 */
export function registerComptabiliteExportRoute(app: FastifyInstance, deps: ComptaExportDeps): void {
  app.get("/api/comptabilite/fec", async (req, reply) => {
    const auth = await authArtisanFromCookie(req, deps);
    if (auth.status === "unauthenticated") return reply.code(401).send({ error: "Non authentifié" });
    if (auth.status === "no-artisan") return reply.code(404).send({ error: "Artisan non trouvé" });

    const q = (req.query ?? {}) as Record<string, unknown>;
    let exp;
    try {
      exp = await getFecExport(deps.reader, { artisanId: auth.artisanId, userId: auth.userId }, { dateDebut: parseDate(q.dateDebut), dateFin: parseDate(q.dateFin) });
    } catch (e) {
      req.log.error({ event: "fec_export_error", artisanId: auth.artisanId, err: e instanceof Error ? e : new Error(String(e)) }, "Erreur génération FEC");
      return reply.code(500).send({ error: "Erreur lors de la génération du FEC" });
    }
    /** FEC = document légal DGFiP ; equilibre=false = Σdébit≠Σcrédit → échec contrôle fiscal. */
    req.log[exp.conformite.equilibre ? "info" : "warn"](
      { event: "fec_export_generated", artisanId: auth.artisanId, nbLignes: exp.conformite.nbLignes, equilibre: exp.conformite.equilibre },
      exp.conformite.equilibre ? "FEC généré (équilibré)" : "FEC généré NON-ÉQUILIBRÉ — Σdébit ≠ Σcrédit",
    );

    return reply
      .header("X-FEC-Equilibre", exp.conformite.equilibre ? "1" : "0")
      .header("X-FEC-Debit", String(exp.conformite.totalDebit))
      .header("X-FEC-Credit", String(exp.conformite.totalCredit))
      .header("X-FEC-Lignes", String(exp.conformite.nbLignes))
      .header("Content-Type", "text/plain; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${exp.fileName}"`)
      /** BOM UTF-8 : aide les outils comptables (DGFiP Test Compta Demat) à détecter l'encodage. */
      .send("﻿" + exp.content);
  });

  /** Export CSV des factures de la période (Date;Numéro;Client;HT;TVA;TTC;Statut). Anti-injection CSV. */
  app.get("/api/comptabilite/export-csv", async (req, reply) => {
    const auth = await authArtisanFromCookie(req, deps);
    if (auth.status === "unauthenticated") return reply.code(401).send({ error: "Non authentifié" });
    if (auth.status === "no-artisan") return reply.code(404).send({ error: "Artisan non trouvé" });

    const q = (req.query ?? {}) as Record<string, unknown>;
    let exp;
    try {
      exp = await getFacturesCsvExport(deps.csvReader, { artisanId: auth.artisanId, userId: auth.userId }, { dateDebut: parseDate(q.dateDebut), dateFin: parseDate(q.dateFin) });
    } catch (e) {
      req.log.error({ event: "factures_csv_export_error", artisanId: auth.artisanId, err: e instanceof Error ? e : new Error(String(e)) }, "Erreur export CSV factures");
      return reply.code(500).send({ error: "Erreur lors de l'export CSV" });
    }
    req.log.info({ event: "factures_csv_export_generated", artisanId: auth.artisanId }, "Export CSV factures généré");

    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${exp.fileName}"`)
      /** le BOM est déjà inclus par buildFacturesCsv */
      .send(exp.content);
  });
}
