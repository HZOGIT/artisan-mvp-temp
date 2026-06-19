import type { TenantContext } from "../../../shared/tenant";
import type { IDevisStatsReader } from "../application/devis-stats-reader";
import type { DevisStatRow } from "../domain/devis-stats";

/** Lecteur fake déterministe (aucun réseau) : lignes devis par tenant, injectées via `seed`. */
export class FakeDevisStatsReader implements IDevisStatsReader {
  private readonly rows = new Map<number, DevisStatRow[]>();

  seed(artisanId: number, rows: DevisStatRow[]): void {
    this.rows.set(artisanId, rows);
  }

  async getDevisForStats(ctx: TenantContext): Promise<DevisStatRow[]> {
    return [...(this.rows.get(ctx.artisanId) ?? [])];
  }
}
