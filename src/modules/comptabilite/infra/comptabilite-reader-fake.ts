import type { TenantContext } from "../../../shared/tenant";
import type { DeclarationTVABrut, IComptabiliteReader, Periode } from "../application/comptabilite-reader";
import type { Ecriture } from "../domain/comptabilite";

// Lecteur fake déterministe : écritures par tenant (filtrées par période) + détail TVA brut injecté.
export class FakeComptabiliteReader implements IComptabiliteReader {
  private readonly ecritures = new Map<number, Ecriture[]>();
  private readonly tvaBrut = new Map<number, DeclarationTVABrut>();

  seedEcritures(artisanId: number, ecritures: Ecriture[]): void {
    this.ecritures.set(artisanId, ecritures);
  }
  seedDeclarationTVA(artisanId: number, brut: DeclarationTVABrut): void {
    this.tvaBrut.set(artisanId, brut);
  }

  private inRange(e: Ecriture, p: Periode): boolean {
    const t = new Date(e.dateEcriture).getTime();
    return t >= p.dateDebut.getTime() && t <= p.dateFin.getTime();
  }

  async listEcritures(ctx: TenantContext, p: Periode): Promise<Ecriture[]> {
    return (this.ecritures.get(ctx.artisanId) ?? [])
      .filter((e) => this.inRange(e, p))
      .slice()
      .sort((a, b) => a.numeroCompte.localeCompare(b.numeroCompte) || a.dateEcriture.getTime() - b.dateEcriture.getTime());
  }

  async listJournalVentes(ctx: TenantContext, p: Periode): Promise<Ecriture[]> {
    return (this.ecritures.get(ctx.artisanId) ?? [])
      .filter((e) => e.journal === "VE" && this.inRange(e, p))
      .slice()
      .sort((a, b) => a.dateEcriture.getTime() - b.dateEcriture.getTime());
  }

  async declarationTVADetail(ctx: TenantContext): Promise<DeclarationTVABrut> {
    return this.tvaBrut.get(ctx.artisanId) ?? { parTaux: [], tvaDeductible: 0 };
  }
}
