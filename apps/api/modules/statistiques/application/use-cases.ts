import type { TenantContext } from "../../../shared/tenant";
import { computeDevisStats } from "../domain/devis-stats";
import type { DevisStats } from "../domain/devis-stats";
import type { IDevisStatsReader } from "./devis-stats-reader";

/** Statistiques devis du tenant : lit les lignes scopées puis agrège (fonction pure). */
export async function getDevisStats(reader: IDevisStatsReader, ctx: TenantContext): Promise<DevisStats> {
  return computeDevisStats(await reader.getDevisForStats(ctx));
}
