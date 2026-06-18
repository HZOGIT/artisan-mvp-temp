import type { TenantContext } from "../../../shared/tenant";
import type { IPrevisionCARepository } from "../application/prevision-ca-repository";
import type {
  CreatePrevisionInput,
  PrevisionCA,
  UpdatePrevisionInput,
  HistoriqueCA,
  UpsertHistoriqueInput,
  UpsertPrevisionInput,
} from "../domain/prevision-ca";

// Implémentation in-memory du repository previsions-ca (tests sans DB). Reproduit les invariants du
// repo Drizzle : scope par artisanId, artisanId forcé, défauts montants "0.00", confiance null, update
// qui ne touche que les montants/méthode/confiance (mois/annee immuables). Pas d'unicité.
export class FakePrevisionCARepository implements IPrevisionCARepository {
  private readonly store: PrevisionCA[] = [];
  private seq = 0;

  private scoped(ctx: TenantContext): PrevisionCA[] {
    return this.store.filter((p) => p.artisanId === ctx.artisanId);
  }

  async list(ctx: TenantContext): Promise<PrevisionCA[]> {
    return [...this.scoped(ctx)].sort((a, b) => b.annee - a.annee || b.mois - a.mois || b.id - a.id);
  }

  async listByAnnee(ctx: TenantContext, annee: number): Promise<PrevisionCA[]> {
    return (await this.list(ctx)).filter((p) => p.annee === annee);
  }

  async getById(ctx: TenantContext, id: number): Promise<PrevisionCA | null> {
    return this.scoped(ctx).find((p) => p.id === id) ?? null;
  }

  async create(ctx: TenantContext, input: CreatePrevisionInput): Promise<PrevisionCA> {
    const now = new Date();
    const prevision: PrevisionCA = {
      id: ++this.seq,
      artisanId: ctx.artisanId,
      mois: input.mois,
      annee: input.annee,
      caPrevisionnel: input.caPrevisionnel ?? "0.00",
      caRealise: input.caRealise ?? "0.00",
      ecart: input.ecart ?? "0.00",
      ecartPourcentage: input.ecartPourcentage ?? "0.00",
      methodeCalcul: input.methodeCalcul ?? "moyenne_mobile",
      confiance: input.confiance ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.store.push(prevision);
    return prevision;
  }

  async update(ctx: TenantContext, id: number, input: UpdatePrevisionInput): Promise<PrevisionCA | null> {
    const idx = this.store.findIndex((p) => p.id === id && p.artisanId === ctx.artisanId);
    if (idx === -1) return null;
    const current = this.store[idx];
    const next: PrevisionCA = {
      ...current,
      ...(input.caPrevisionnel !== undefined ? { caPrevisionnel: input.caPrevisionnel } : {}),
      ...(input.caRealise !== undefined ? { caRealise: input.caRealise } : {}),
      ...(input.ecart !== undefined ? { ecart: input.ecart } : {}),
      ...(input.ecartPourcentage !== undefined ? { ecartPourcentage: input.ecartPourcentage } : {}),
      ...(input.methodeCalcul !== undefined ? { methodeCalcul: input.methodeCalcul } : {}),
      ...(input.confiance !== undefined ? { confiance: input.confiance } : {}),
      updatedAt: new Date(),
      // mois/annee jamais touchés (période immuable)
    };
    this.store[idx] = next;
    return next;
  }

  async delete(ctx: TenantContext, id: number): Promise<boolean> {
    const idx = this.store.findIndex((p) => p.id === id && p.artisanId === ctx.artisanId);
    if (idx === -1) return false;
    this.store.splice(idx, 1);
    return true;
  }

  // Historique de CA (table distincte) — injecté en test via `seedHistorique`.
  private readonly historique: HistoriqueCA[] = [];
  private histSeq = 1000;

  // Aide de test : ajoute une ligne d'historique de CA pour un tenant.
  seedHistorique(entry: HistoriqueCA): void {
    this.historique.push(entry);
  }

  async listHistorique(ctx: TenantContext, nombreMois: number): Promise<HistoriqueCA[]> {
    return this.historique
      .filter((h) => h.artisanId === ctx.artisanId)
      .sort((a, b) => b.annee - a.annee || b.mois - a.mois)
      .slice(0, nombreMois);
  }

  async listHistoriqueAnnee(ctx: TenantContext, annee: number): Promise<HistoriqueCA[]> {
    return this.historique.filter((h) => h.artisanId === ctx.artisanId && h.annee === annee);
  }

  async upsertHistorique(ctx: TenantContext, entry: UpsertHistoriqueInput): Promise<void> {
    const i = this.historique.findIndex((h) => h.artisanId === ctx.artisanId && h.mois === entry.mois && h.annee === entry.annee);
    if (i !== -1) this.historique.splice(i, 1);
    this.historique.push({
      id: ++this.histSeq,
      artisanId: ctx.artisanId,
      mois: entry.mois,
      annee: entry.annee,
      caTotal: entry.caTotal,
      nombreFactures: entry.nombreFactures,
      nombreClients: entry.nombreClients,
      panierMoyen: entry.panierMoyen,
      tauxConversion: null,
      createdAt: new Date(),
    });
  }

  async upsertPrevision(ctx: TenantContext, entry: UpsertPrevisionInput): Promise<void> {
    const i = this.store.findIndex((p) => p.artisanId === ctx.artisanId && p.mois === entry.mois && p.annee === entry.annee);
    if (i !== -1) this.store.splice(i, 1);
    const now = new Date();
    this.store.push({
      id: ++this.seq,
      artisanId: ctx.artisanId,
      mois: entry.mois,
      annee: entry.annee,
      caPrevisionnel: entry.caPrevisionnel,
      caRealise: "0.00",
      ecart: "0.00",
      ecartPourcentage: "0.00",
      methodeCalcul: entry.methodeCalcul,
      confiance: entry.confiance,
      createdAt: now,
      updatedAt: now,
    });
  }
}
