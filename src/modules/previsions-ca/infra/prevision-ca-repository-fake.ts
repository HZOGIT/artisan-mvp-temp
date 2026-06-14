import type { TenantContext } from "../../../shared/tenant";
import type { IPrevisionCARepository } from "../application/prevision-ca-repository";
import type { CreatePrevisionInput, PrevisionCA, UpdatePrevisionInput } from "../domain/prevision-ca";

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
}
