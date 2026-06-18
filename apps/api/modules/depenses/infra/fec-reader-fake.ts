import type { TenantContext } from "../../../shared/tenant";
import type { FecReader } from "../application/fec-reader";
import type { FecDepense, ConfigComptable } from "../domain/fec";

const DEFAULT_CONFIG: ConfigComptable = {
  compteAchats: "607000",
  compteTVADeductible: "445660",
  compteFournisseurs: "401000",
  journalAchats: "AC",
};

// Double in-memory du FecReader (tests sans DB). Filtre déductibles par période + scope tenant.
export class FakeFecReader implements FecReader {
  private depenses: Array<FecDepense & { artisanId: number; deductible: boolean }> = [];
  private configs = new Map<number, ConfigComptable>();

  seedDepense(artisanId: number, d: FecDepense, deductible = true): void {
    this.depenses.push({ ...d, artisanId, deductible });
  }
  setConfig(artisanId: number, config: ConfigComptable): void {
    this.configs.set(artisanId, config);
  }

  async listDepensesDeductibles(ctx: TenantContext, dateDebut: string, dateFin: string): Promise<FecDepense[]> {
    return this.depenses
      .filter((d) => d.artisanId === ctx.artisanId && d.deductible && d.dateDepense >= dateDebut && d.dateDepense <= dateFin)
      .sort((a, b) => (a.dateDepense < b.dateDepense ? -1 : a.dateDepense > b.dateDepense ? 1 : a.id - b.id))
      .map(({ artisanId: _a, deductible: _d, ...rest }) => rest);
  }

  async getConfigComptable(ctx: TenantContext): Promise<ConfigComptable> {
    return this.configs.get(ctx.artisanId) ?? DEFAULT_CONFIG;
  }
}
