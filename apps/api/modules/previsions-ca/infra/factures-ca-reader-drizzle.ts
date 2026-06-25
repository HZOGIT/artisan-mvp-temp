import { sql } from "drizzle-orm";
import { factures } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { FacturesCAReader } from "../application/factures-ca-reader";
import type { CAParMois } from "../domain/prevision-ca";

/*
 * Agrège le CA réalisé (factures PAYÉES) par mois/année — scopé tenant (RLS sur `factures.artisanId`
 * + filtre explicite). Le groupage est fait en SQL (moins de données rapatriées que le legacy JS).
 * Date de référence = `dateFacture` (fallback `createdAt`), comme le legacy.
 */
export class FacturesCAReaderDrizzle implements FacturesCAReader {
  constructor(private readonly db: DbClient) {}

  aggregatePaidByMonth(ctx: TenantContext): Promise<CAParMois[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select({
          mois: sql<number>`extract(month from coalesce(${factures.dateFacture}, ${factures.createdAt}))::int`,
          annee: sql<number>`extract(year from coalesce(${factures.dateFacture}, ${factures.createdAt}))::int`,
          caTotal: sql<string>`coalesce(sum(${factures.totalHT}), 0)::text`,
          nombreFactures: sql<number>`count(*)::int`,
          nombreClients: sql<number>`count(distinct ${factures.clientId})::int`,
        })
        .from(factures)
        .where(sql`${factures.artisanId} = ${ctx.artisanId} and (${factures.statut} = 'payee' or (${factures.typeDocument} = 'avoir' and ${factures.statut} = 'validee'))`)
        .groupBy(
          sql`extract(month from coalesce(${factures.dateFacture}, ${factures.createdAt}))`,
          sql`extract(year from coalesce(${factures.dateFacture}, ${factures.createdAt}))`,
        );
      return rows.map((r) => ({
        mois: r.mois,
        annee: r.annee,
        caTotal: r.caTotal,
        nombreFactures: r.nombreFactures,
        nombreClients: r.nombreClients,
      }));
    });
  }
}
