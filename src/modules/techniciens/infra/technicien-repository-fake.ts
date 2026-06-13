import type { TenantContext } from "../../../shared/tenant";
import type { ITechnicienRepository } from "../application/technicien-repository";
import type { Technicien, CreateTechnicienInput, UpdateTechnicienInput } from "../domain/technicien";

// Double in-memory du repository pour les tests de use-cases (sans DB). Reproduit le
// scoping tenant : artisanId forcé du contexte, ressource hors tenant invisible.
export class FakeTechnicienRepository implements ITechnicienRepository {
  private store: Technicien[] = [];
  private seq = 0;

  async list(ctx: TenantContext): Promise<Technicien[]> {
    return this.store.filter((t) => t.artisanId === ctx.artisanId);
  }

  async getById(ctx: TenantContext, id: number): Promise<Technicien | null> {
    return this.store.find((t) => t.id === id && t.artisanId === ctx.artisanId) ?? null;
  }

  async create(ctx: TenantContext, input: CreateTechnicienInput): Promise<Technicien> {
    const now = new Date();
    const t: Technicien = {
      id: ++this.seq,
      artisanId: ctx.artisanId,
      nom: input.nom,
      prenom: input.prenom ?? null,
      email: input.email ?? null,
      telephone: input.telephone ?? null,
      specialite: input.specialite ?? null,
      couleur: input.couleur ?? null,
      statut: input.statut ?? "actif",
      coutHoraire: input.coutHoraire ?? null,
      userId: input.userId ?? null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.store.push(t);
    return t;
  }

  async update(ctx: TenantContext, id: number, input: UpdateTechnicienInput): Promise<Technicien | null> {
    const t = await this.getById(ctx, id);
    if (!t) return null;
    const updated: Technicien = { ...t, ...input, updatedAt: new Date() };
    this.store = this.store.map((x) => (x.id === id ? updated : x));
    return updated;
  }

  async delete(ctx: TenantContext, id: number): Promise<boolean> {
    const t = await this.getById(ctx, id);
    if (!t) return false;
    this.store = this.store.filter((x) => x.id !== id);
    return true;
  }
}
