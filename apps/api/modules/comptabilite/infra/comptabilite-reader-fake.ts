import type { TenantContext } from "../../../shared/tenant";
import type { DeclarationTVABrut, IComptabiliteReader, Periode } from "../application/comptabilite-reader";
import type { Ecriture } from "../domain/comptabilite";
import { DEFAULT_FEC_CONFIG } from "../domain/fec";
import type { FecConfig, FecInput } from "../domain/fec";

const EMPTY_FEC: FecInput = { factures: [], depenses: [], encaissements: [] };

/** Lecteur fake déterministe : écritures par tenant (filtrées par période) + détail TVA brut injecté. */
export class FakeComptabiliteReader implements IComptabiliteReader {
  private readonly ecritures = new Map<number, Ecriture[]>();
  private readonly tvaBrut = new Map<number, DeclarationTVABrut>();
  private readonly fecData = new Map<number, FecInput>();
  private readonly fecCfg = new Map<number, FecConfig>();
  private readonly sirets = new Map<number, string>();

  seedEcritures(artisanId: number, ecritures: Ecriture[]): void {
    this.ecritures.set(artisanId, ecritures);
  }
  seedDeclarationTVA(artisanId: number, brut: DeclarationTVABrut): void {
    this.tvaBrut.set(artisanId, brut);
  }
  seedFecInput(artisanId: number, input: FecInput): void {
    this.fecData.set(artisanId, input);
  }
  seedFecConfig(artisanId: number, config: FecConfig): void {
    this.fecCfg.set(artisanId, config);
  }
  seedSiret(artisanId: number, siret: string): void {
    this.sirets.set(artisanId, siret);
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

  async fecInput(ctx: TenantContext): Promise<FecInput> {
    return this.fecData.get(ctx.artisanId) ?? EMPTY_FEC;
  }
  async fecConfig(ctx: TenantContext): Promise<FecConfig> {
    return this.fecCfg.get(ctx.artisanId) ?? DEFAULT_FEC_CONFIG;
  }
  async siret(ctx: TenantContext): Promise<string | null> {
    return this.sirets.get(ctx.artisanId) ?? null;
  }
}
