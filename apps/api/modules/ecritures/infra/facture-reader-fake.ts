import type { TenantContext } from "../../../shared/tenant";
import type { IFactureReader, FactureReadModel, FactureLigneReadModel } from "../application/facture-reader";

/** Double in-memory du lecteur de factures (pour tester la génération FEC sans DB). Scopé tenant. */
export class FakeFactureReader implements IFactureReader {
  private store = new Map<number, FactureReadModel>();
  private lignes = new Map<number, FactureLigneReadModel[]>();

  register(facture: FactureReadModel, lignes: FactureLigneReadModel[] = []): void {
    this.store.set(facture.id, facture);
    this.lignes.set(facture.id, lignes);
  }

  async getFacture(ctx: TenantContext, factureId: number): Promise<FactureReadModel | null> {
    const f = this.store.get(factureId);
    return f && f.artisanId === ctx.artisanId ? f : null;
  }

  async getLignes(ctx: TenantContext, factureId: number): Promise<FactureLigneReadModel[]> {
    const f = this.store.get(factureId);
    if (!f || f.artisanId !== ctx.artisanId) return [];
    return this.lignes.get(factureId) ?? [];
  }
}
