import type { TenantContext } from "../../../shared/tenant";
import type { IChantierRepository } from "../application/chantier-repository";
import type { Chantier, CreateChantierInput, UpdateChantierInput } from "../domain/chantier";

// Double in-memory du repository pour les tests de use-cases (sans DB). Reproduit le scoping
// tenant et les valeurs par défaut PG (statut planifie, priorite normale, avancement 0,
// budgetRealise "0.00"). Aucune fuite cross-tenant ; `update` ne touche pas `clientId`.
export class FakeChantierRepository implements IChantierRepository {
  private store: Chantier[] = [];
  private seq = 0;
  // Clients appartenant à un tenant (injectable) : clé `${artisanId}:${clientId}`.
  private ownedClients = new Set<string>();

  // Aide de test : déclare qu'un client appartient au tenant.
  registerClient(artisanId: number, clientId: number): void {
    this.ownedClients.add(`${artisanId}:${clientId}`);
  }

  async list(ctx: TenantContext): Promise<Chantier[]> {
    return this.store.filter((c) => c.artisanId === ctx.artisanId);
  }

  async getById(ctx: TenantContext, id: number): Promise<Chantier | null> {
    return this.store.find((c) => c.id === id && c.artisanId === ctx.artisanId) ?? null;
  }

  async create(ctx: TenantContext, input: CreateChantierInput): Promise<Chantier> {
    const now = new Date();
    const c: Chantier = {
      id: ++this.seq,
      artisanId: ctx.artisanId,
      clientId: input.clientId,
      reference: input.reference,
      nom: input.nom,
      description: input.description ?? null,
      adresse: input.adresse ?? null,
      codePostal: input.codePostal ?? null,
      ville: input.ville ?? null,
      dateDebut: input.dateDebut ?? null,
      dateFinPrevue: input.dateFinPrevue ?? null,
      dateFinReelle: input.dateFinReelle ?? null,
      budgetPrevisionnel: input.budgetPrevisionnel ?? null,
      budgetRealise: input.budgetRealise ?? "0.00",
      statut: input.statut ?? "planifie",
      avancement: input.avancement ?? 0,
      priorite: input.priorite ?? "normale",
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.store.push(c);
    return c;
  }

  async update(ctx: TenantContext, id: number, input: UpdateChantierInput): Promise<Chantier | null> {
    const c = await this.getById(ctx, id);
    if (!c) return null;
    // `input` (UpdateChantierInput) n'a pas `clientId` → le client reste intact.
    const updated: Chantier = { ...c, ...input, updatedAt: new Date() };
    this.store = this.store.map((x) => (x.id === id ? updated : x));
    return updated;
  }

  async delete(ctx: TenantContext, id: number): Promise<boolean> {
    const c = await this.getById(ctx, id);
    if (!c) return false;
    this.store = this.store.filter((x) => x.id !== id);
    return true;
  }

  async ownsClient(ctx: TenantContext, clientId: number): Promise<boolean> {
    return this.ownedClients.has(`${ctx.artisanId}:${clientId}`);
  }
}
