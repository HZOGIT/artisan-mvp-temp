import { and, isNull, inArray, eq, asc } from "drizzle-orm";
import { factures, facturesLignes, artisans, clients } from "../../../../../drizzle/schema.pg";
import type { StoragePort } from "../../../shared/ports/storage";
import type { PdfPort } from "../../../shared/ports/pdf";
import type { DbClient } from "../../../shared/db";

export type BackfillResult = { traites: number; skips: number; erreurs: number };

const STATUTS_EMIS = ["envoyee", "payee", "en_retard", "annulee"] as const;

/**
 * Backfill one-shot idempotent : génère et stocke le PDF pour chaque facture émise
 * sans pdfFileId. Repartable (skip si déjà posé). Retourne les compteurs d'exécution.
 *
 * ⚠️ Best-effort : le PDF régénéré peut différer de l'original émis (logique PDF peut avoir évolué).
 * L'immuabilité stricte est garantie uniquement par le stockage à l'émission.
 */
export async function backfillFacturePdf(
  db: DbClient,
  storage: StoragePort,
  pdf: PdfPort,
): Promise<BackfillResult> {
  let traites = 0;
  let skips = 0;
  let erreurs = 0;

  const cibles = await db
    .select()
    .from(factures)
    .where(and(
      inArray(factures.statut, STATUTS_EMIS as unknown as ("brouillon" | "validee" | "envoyee" | "payee" | "en_retard" | "annulee")[]),
      isNull(factures.pdfFileId),
    ));

  for (const row of cibles) {
    /* re-check idempotence : un run concurrent peut avoir posé pdfFileId entre la requête initiale et ce tour */
    const [current] = await db
      .select({ pdfFileId: factures.pdfFileId })
      .from(factures)
      .where(eq(factures.id, row.id))
      .limit(1);
    if (current?.pdfFileId != null) { skips++; continue; }

    try {
      const [artisan] = await db
        .select()
        .from(artisans)
        .where(eq(artisans.id, row.artisanId))
        .limit(1);
      const [client] = await db
        .select()
        .from(clients)
        .where(eq(clients.id, row.clientId))
        .limit(1);

      if (!artisan || !client) { skips++; continue; }

      const lignes = await db
        .select()
        .from(facturesLignes)
        .where(eq(facturesLignes.factureId, row.id))
        .orderBy(asc(facturesLignes.ordre), asc(facturesLignes.id));

      const pdfBuf = await pdf.render("facture", {
        facture: {
          ...row,
          totalHT: row.totalHT ?? "0.00",
          totalTVA: row.totalTVA ?? "0.00",
          totalTTC: row.totalTTC ?? "0.00",
          montantPaye: row.montantPaye ?? "0.00",
          nombreRelances: row.nombreRelances ?? 0,
          regimeTVA: row.regimeTVA ?? "normal",
          lignes,
        },
        artisan,
        client,
      });

      const s3Key = `factures/${row.artisanId}/${row.id}.pdf`;
      const stored = await storage.upload(s3Key, pdfBuf, {
        contentType: "application/pdf",
        artisanId: row.artisanId,
        filename: `Facture_${row.numero ?? row.id}.pdf`,
        purpose: "facture-pdf",
      });

      /* guard isNull pour idempotence face à un concurrent — seul le premier run pose la valeur */
      await db
        .update(factures)
        .set({ pdfFileId: stored.id, pdfStorageKey: stored.storageKey, updatedAt: new Date() })
        .where(and(eq(factures.id, row.id), isNull(factures.pdfFileId)));

      traites++;
    } catch (_err) {
      erreurs++;
    }
  }

  return { traites, skips, erreurs };
}
