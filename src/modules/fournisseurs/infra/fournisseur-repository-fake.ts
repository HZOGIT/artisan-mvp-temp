import type { TenantContext } from "../../../shared/tenant";
import type { IFournisseurRepository } from "../application/fournisseur-repository";
import type { Fournisseur, CreateFournisseurInput, UpdateFournisseurInput } from "../domain/fournisseur";

// Double in-memory du repository pour les tests de use-cases (sans DB). Reproduit le
// scoping tenant : artisanId forcé du contexte, ressource hors tenant invisible.
export class FakeFournisseurRepository implements IFournisseurRepository {
  private store: Fournisseur[] = [];
  private seq = 0;

  async list(ctx: TenantContext): Promise<Fournisseur[]> {
    return this.store.filter((f) => f.artisanId === ctx.artisanId);
  }

  async getById(ctx: TenantContext, id: number): Promise<Fournisseur | null> {
    return this.store.find((f) => f.id === id && f.artisanId === ctx.artisanId) ?? null;
  }

  async create(ctx: TenantContext, input: CreateFournisseurInput): Promise<Fournisseur> {
    const now = new Date();
    const f: Fournisseur = {
      id: ++this.seq,
      artisanId: ctx.artisanId,
      nom: input.nom,
      contact: input.contact ?? null,
      email: input.email ?? null,
      telephone: input.telephone ?? null,
      adresse: input.adresse ?? null,
      codePostal: input.codePostal ?? null,
      ville: input.ville ?? null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.store.push(f);
    return f;
  }

  async update(ctx: TenantContext, id: number, input: UpdateFournisseurInput): Promise<Fournisseur | null> {
    const f = await this.getById(ctx, id);
    if (!f) return null;
    const updated: Fournisseur = { ...f, ...input, updatedAt: new Date() };
    this.store = this.store.map((x) => (x.id === id ? updated : x));
    return updated;
  }

  async delete(ctx: TenantContext, id: number): Promise<boolean> {
    const f = await this.getById(ctx, id);
    if (!f) return false;
    this.store = this.store.filter((x) => x.id !== id);
    return true;
  }
}
