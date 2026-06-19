import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { factures, depenses } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { TresorerieReader } from "../application/tresorerie-reader";
import type { TresorerieData } from "../domain/prevision-ca";

/*
 * Charge les données de trésorerie du tenant (scopées RLS sur `factures.artisanId`/`depenses.artisan_id`
 * + filtres explicites). Lecture seule. Le calcul (bucketing hebdo) est fait par le use-case pur.
 */
export class TresorerieReaderDrizzle implements TresorerieReader {
  constructor(private readonly db: DbClient) {}

  load(ctx: TenantContext): Promise<TresorerieData> {
    return withTenant(this.db, ctx, async (tx) => {
      /** Créances : factures non soldées (envoyée/en_retard) avec leur reste dû. */
      const creancesRows = await tx
        .select({ dateEcheance: factures.dateEcheance, totalTTC: factures.totalTTC, montantPaye: factures.montantPaye })
        .from(factures)
        .where(and(eq(factures.artisanId, ctx.artisanId), inArray(factures.statut, ["envoyee", "en_retard"])));

      /** Avoirs (crédits client) : on nette leur totalTTC contre les encaissements attendus. */
      const avoirsRows = await tx
        .select({ totalTTC: factures.totalTTC })
        .from(factures)
        .where(
          and(
            eq(factures.artisanId, ctx.artisanId),
            eq(factures.typeDocument, "avoir"),
            inArray(factures.statut, ["validee", "envoyee", "en_retard", "payee"]),
          ),
        );

      /** Dépenses récurrentes avec une prochaine occurrence connue. */
      const depRows = await tx
        .select({
          montantTtc: depenses.montant_ttc,
          frequence: sql<string | null>`${depenses.frequence_recurrence}`,
          prochaineOccurrence: depenses.prochaine_occurrence,
        })
        .from(depenses)
        .where(and(eq(depenses.artisan_id, ctx.artisanId), eq(depenses.recurrente, true), isNotNull(depenses.prochaine_occurrence)));

      return {
        creances: creancesRows.map((r) => ({
          dateEcheance: r.dateEcheance ? new Date(r.dateEcheance).toISOString() : null,
          totalTTC: r.totalTTC ?? "0",
          montantPaye: r.montantPaye ?? "0",
        })),
        avoirsTotalTTC: avoirsRows.map((r) => r.totalTTC ?? "0"),
        depensesRecurrentes: depRows.map((r) => ({
          montantTtc: r.montantTtc ?? "0",
          frequence: r.frequence ?? null,
          prochaineOccurrence: r.prochaineOccurrence ?? null,
        })),
      };
    });
  }
}
