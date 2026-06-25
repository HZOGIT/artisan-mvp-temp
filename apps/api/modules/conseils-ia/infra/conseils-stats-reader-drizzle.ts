import { and, eq, inArray, lte, notInArray, sql } from "drizzle-orm";
import { devis, factures, stocks } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { ConseilsStats } from "../domain/conseils";
import type { ConseilsStatsReader } from "../application/conseils-stats-reader";

/*
 * Stats minimales du tenant pour le prompt des conseils IA, sous RLS (withTenant) + filtre artisanId
 * explicite. Agrégats SQL (count/sum) — lecture seule. Sémantique parité dashboard.
 */
export class ConseilsStatsReaderDrizzle implements ConseilsStatsReader {
  constructor(private readonly db: DbClient) {}

  getStats(ctx: TenantContext): Promise<ConseilsStats> {
    return withTenant(this.db, ctx, async (tx) => {
      const [devisRow] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(devis)
        .where(and(eq(devis.artisanId, ctx.artisanId), inArray(devis.statut, ["brouillon", "envoye"])));

      const [factRow] = await tx
        .select({ n: sql<number>`count(*)::int`, total: sql<string>`coalesce(sum(${factures.totalTTC}), 0)` })
        .from(factures)
        .where(and(eq(factures.artisanId, ctx.artisanId), notInArray(factures.statut, ["payee", "annulee", "brouillon"])));

      const [stockRow] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(stocks)
        .where(and(eq(stocks.artisanId, ctx.artisanId), lte(stocks.quantiteEnStock, stocks.seuilAlerte)));

      return {
        nbDevisEnAttente: devisRow?.n ?? 0,
        nbFacturesImpayees: factRow?.n ?? 0,
        montantImpayees: Number(factRow?.total ?? 0),
        nbStocksBas: stockRow?.n ?? 0,
      };
    });
  }
}
