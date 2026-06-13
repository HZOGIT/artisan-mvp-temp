import type { TenantContext } from "../../../shared/tenant";
import type { ICongeRepository } from "../application/conge-repository";
import type { Conge, CreateCongeInput, UpdateCongeInput } from "../domain/conge";

// Double in-memory du repository pour les tests de use-cases (sans DB). Reproduit le scoping
// tenant et les valeurs par défaut PG (`statut` → en_attente, demi-journées → false). ⚠️
// `update` ne touche pas statut/validePar/dateValidation (réservés au workflow d'approbation).
export class FakeCongeRepository implements ICongeRepository {
  private store: Conge[] = [];
  private seq = 0;
  // Techniciens appartenant à un tenant (injectable) : clé `${artisanId}:${technicienId}`.
  private ownedTechniciens = new Set<string>();

  // Aide de test : déclare qu'un technicien appartient au tenant.
  registerTechnicien(artisanId: number, technicienId: number): void {
    this.ownedTechniciens.add(`${artisanId}:${technicienId}`);
  }

  async list(ctx: TenantContext): Promise<Conge[]> {
    return this.store.filter((c) => c.artisanId === ctx.artisanId);
  }

  async getById(ctx: TenantContext, id: number): Promise<Conge | null> {
    return this.store.find((c) => c.id === id && c.artisanId === ctx.artisanId) ?? null;
  }

  async create(ctx: TenantContext, input: CreateCongeInput): Promise<Conge> {
    const now = new Date();
    const c: Conge = {
      id: ++this.seq,
      artisanId: ctx.artisanId,
      technicienId: input.technicienId,
      type: input.type,
      dateDebut: input.dateDebut,
      dateFin: input.dateFin,
      demiJourneeDebut: input.demiJourneeDebut ?? false,
      demiJourneeFin: input.demiJourneeFin ?? false,
      motif: input.motif ?? null,
      statut: "en_attente",
      commentaireValidation: null,
      dateValidation: null,
      validePar: null,
      createdAt: now,
      updatedAt: now,
    };
    this.store.push(c);
    return c;
  }

  async update(ctx: TenantContext, id: number, input: UpdateCongeInput): Promise<Conge | null> {
    const c = await this.getById(ctx, id);
    if (!c) return null;
    // `input` n'a pas statut/validePar/dateValidation → workflow intact.
    const updated: Conge = { ...c, ...input, updatedAt: new Date() };
    this.store = this.store.map((x) => (x.id === id ? updated : x));
    return updated;
  }

  async delete(ctx: TenantContext, id: number): Promise<boolean> {
    const c = await this.getById(ctx, id);
    if (!c) return false;
    this.store = this.store.filter((x) => x.id !== id);
    return true;
  }

  async ownsTechnicien(ctx: TenantContext, technicienId: number): Promise<boolean> {
    return this.ownedTechniciens.has(`${ctx.artisanId}:${technicienId}`);
  }
}
