import { eq } from "drizzle-orm";
import { devis } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IDevisStatsReader } from "../application/devis-stats-reader";
import type { DevisStatRow } from "../domain/devis-stats";

// Lecteur Drizzle des stats devis : projection minimale (statut, totalTTC) scopée tenant (RLS via
// withTenant + filtre explicite `artisanId`). Aucune écriture.
export class DevisStatsReaderDrizzle implements IDevisStatsReader {
  constructor(private readonly db: DbClient) {}

  async getDevisForStats(ctx: TenantContext): Promise<DevisStatRow[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select({ statut: devis.statut, totalTTC: devis.totalTTC })
        .from(devis)
        .where(eq(devis.artisanId, ctx.artisanId));
      return rows.map((r) => ({ statut: r.statut ?? null, totalTTC: r.totalTTC ?? null }));
    });
  }
}
