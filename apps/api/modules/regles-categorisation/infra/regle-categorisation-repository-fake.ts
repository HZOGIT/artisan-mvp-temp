import type { TenantContext } from "../../../shared/tenant";
import type { IRegleCategorisationRepository } from "../application/regle-categorisation-repository";
import type { RegleCategorisation, CreateRegleInput, UpdateRegleInput } from "../domain/regle-categorisation";

/*
 * Implémentation in-memory du repository regles-categorisation (tests sans DB). Reproduit les
 * invariants du repo Drizzle : scope par artisanId, artisanId forcé, défaut `actif` true, update
 * partiel. Pas d'unicité (plusieurs règles peuvent partager motif/catégorie).
 */
export class FakeRegleCategorisationRepository implements IRegleCategorisationRepository {
  private readonly store: RegleCategorisation[] = [];
  private seq = 0;

  private scoped(ctx: TenantContext): RegleCategorisation[] {
    return this.store.filter((r) => r.artisanId === ctx.artisanId);
  }

  async list(ctx: TenantContext): Promise<RegleCategorisation[]> {
    return [...this.scoped(ctx)].sort((a, b) => a.id - b.id);
  }

  async getById(ctx: TenantContext, id: number): Promise<RegleCategorisation | null> {
    return this.scoped(ctx).find((r) => r.id === id) ?? null;
  }

  async create(ctx: TenantContext, input: CreateRegleInput): Promise<RegleCategorisation> {
    const regle: RegleCategorisation = {
      id: ++this.seq,
      artisanId: ctx.artisanId,
      motifLibelle: input.motifLibelle,
      categorie: input.categorie,
      actif: input.actif ?? true,
      createdAt: new Date(),
    };
    this.store.push(regle);
    return regle;
  }

  async update(ctx: TenantContext, id: number, input: UpdateRegleInput): Promise<RegleCategorisation | null> {
    const idx = this.store.findIndex((r) => r.id === id && r.artisanId === ctx.artisanId);
    if (idx === -1) return null;
    const current = this.store[idx];
    const next: RegleCategorisation = {
      ...current,
      ...(input.motifLibelle !== undefined ? { motifLibelle: input.motifLibelle } : {}),
      ...(input.categorie !== undefined ? { categorie: input.categorie } : {}),
      ...(input.actif !== undefined ? { actif: input.actif } : {}),
    };
    this.store[idx] = next;
    return next;
  }

  async delete(ctx: TenantContext, id: number): Promise<boolean> {
    const idx = this.store.findIndex((r) => r.id === id && r.artisanId === ctx.artisanId);
    if (idx === -1) return false;
    this.store.splice(idx, 1);
    return true;
  }
}
