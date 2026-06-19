import type { TenantContext } from "../../../shared/tenant";
import type { ConseilsStats } from "../domain/conseils";
import type { ConseilsStatsReader } from "../application/conseils-stats-reader";

/** Stats fake (in-memory) par tenant pour les tests des use-cases conseils IA. */
export class FakeConseilsStatsReader implements ConseilsStatsReader {
  private byTenant = new Map<number, ConseilsStats>();
  public throwOnGet = false;

  seed(artisanId: number, stats: ConseilsStats): void {
    this.byTenant.set(artisanId, stats);
  }

  async getStats(ctx: TenantContext): Promise<ConseilsStats> {
    if (this.throwOnGet) throw new Error("stats indisponibles");
    return this.byTenant.get(ctx.artisanId) ?? { nbDevisEnAttente: 0, nbFacturesImpayees: 0, montantImpayees: 0, nbStocksBas: 0 };
  }
}
