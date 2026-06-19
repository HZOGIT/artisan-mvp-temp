import type { TenantContext } from "../../../shared/tenant";
import type { DevisAnalyseData, TresorerieData } from "../domain/generators";
import type { AssistantDataReader, DevisNonSigneAvecClient } from "../application/assistant-data-reader";

/** Data reader fake (in-memory, par tenant) pour tester les générateurs IA sans DB. */
export class FakeAssistantDataReader implements AssistantDataReader {
  private devisNonSignes = new Map<number, DevisNonSigneAvecClient[]>();
  private catalogues = new Map<number, string>();
  /** clé `${artisanId}:${devisId}` */
  private analyses = new Map<string, DevisAnalyseData>();
  private tresoreries = new Map<number, TresorerieData>();

  seedDevisNonSignes(artisanId: number, rows: DevisNonSigneAvecClient[]): void {
    this.devisNonSignes.set(artisanId, rows);
  }
  seedCatalogue(artisanId: number, catalogue: string): void {
    this.catalogues.set(artisanId, catalogue);
  }
  seedAnalyse(artisanId: number, devisId: number, data: DevisAnalyseData): void {
    this.analyses.set(`${artisanId}:${devisId}`, data);
  }
  seedTresorerie(artisanId: number, data: TresorerieData): void {
    this.tresoreries.set(artisanId, data);
  }

  async listDevisNonSignes(ctx: TenantContext): Promise<DevisNonSigneAvecClient[]> {
    return this.devisNonSignes.get(ctx.artisanId) ?? [];
  }
  async getCatalogue(ctx: TenantContext): Promise<string> {
    return this.catalogues.get(ctx.artisanId) ?? "";
  }
  async getDevisAnalyse(ctx: TenantContext, devisId: number): Promise<DevisAnalyseData | null> {
    return this.analyses.get(`${ctx.artisanId}:${devisId}`) ?? null;
  }
  async getTresorerie(ctx: TenantContext): Promise<TresorerieData> {
    return this.tresoreries.get(ctx.artisanId) ?? { facturesPayees: "", facturesImpayees: "", devisAcceptes: "" };
  }
}
