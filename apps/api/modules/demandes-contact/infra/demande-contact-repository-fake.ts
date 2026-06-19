import type { TenantContext } from "../../../shared/tenant";
import type { IDemandeContactRepository } from "../application/demande-contact-repository";
import type { CreateDemandeInput, DemandeContact, DemandeContactStatut, UpdateDemandeInput } from "../domain/demande-contact";

/*
 * Implémentation in-memory du repository demandes-contact (tests sans DB). Reproduit les invariants
 * du repo Drizzle : scope par artisanId, artisanId forcé, statut="nouveau" + clientId null à la
 * création, update qui ne touche pas statut/clientId, setStatut pour les transitions (+ clientId à la
 * conversion), ownsClient via Set seedable.
 */
export class FakeDemandeContactRepository implements IDemandeContactRepository {
  private readonly store: DemandeContact[] = [];
  private seq = 0;
  private readonly clientsByArtisan = new Map<number, Set<number>>();

  seedClient(artisanId: number, clientId: number): void {
    if (!this.clientsByArtisan.has(artisanId)) this.clientsByArtisan.set(artisanId, new Set());
    this.clientsByArtisan.get(artisanId)!.add(clientId);
  }

  private scoped(ctx: TenantContext): DemandeContact[] {
    return this.store.filter((d) => d.artisanId === ctx.artisanId);
  }

  async list(ctx: TenantContext): Promise<DemandeContact[]> {
    return [...this.scoped(ctx)].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id);
  }

  async listByStatut(ctx: TenantContext, statut: DemandeContactStatut): Promise<DemandeContact[]> {
    return (await this.list(ctx)).filter((d) => d.statut === statut);
  }

  async getById(ctx: TenantContext, id: number): Promise<DemandeContact | null> {
    return this.scoped(ctx).find((d) => d.id === id) ?? null;
  }

  async create(ctx: TenantContext, input: CreateDemandeInput): Promise<DemandeContact> {
    const now = new Date();
    const demande: DemandeContact = {
      id: ++this.seq,
      artisanId: ctx.artisanId,
      nom: input.nom,
      email: input.email ?? null,
      telephone: input.telephone ?? null,
      message: input.message ?? null,
      source: input.source ?? "vitrine",
      /** forcé */
      statut: "nouveau",
      clientId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.store.push(demande);
    return demande;
  }

  async update(ctx: TenantContext, id: number, input: UpdateDemandeInput): Promise<DemandeContact | null> {
    const idx = this.store.findIndex((d) => d.id === id && d.artisanId === ctx.artisanId);
    if (idx === -1) return null;
    const current = this.store[idx];
    const next: DemandeContact = {
      ...current,
      ...(input.nom !== undefined ? { nom: input.nom } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.telephone !== undefined ? { telephone: input.telephone } : {}),
      ...(input.message !== undefined ? { message: input.message } : {}),
      ...(input.source !== undefined ? { source: input.source } : {}),
      /** statut/clientId jamais touchés par update */
      updatedAt: new Date(),
    };
    this.store[idx] = next;
    return next;
  }

  async setStatut(ctx: TenantContext, id: number, statut: DemandeContactStatut, clientId?: number | null): Promise<DemandeContact | null> {
    const idx = this.store.findIndex((d) => d.id === id && d.artisanId === ctx.artisanId);
    if (idx === -1) return null;
    const next: DemandeContact = {
      ...this.store[idx],
      statut,
      ...(clientId !== undefined ? { clientId } : {}),
      updatedAt: new Date(),
    };
    this.store[idx] = next;
    return next;
  }

  async delete(ctx: TenantContext, id: number): Promise<boolean> {
    const idx = this.store.findIndex((d) => d.id === id && d.artisanId === ctx.artisanId);
    if (idx === -1) return false;
    this.store.splice(idx, 1);
    return true;
  }

  async ownsClient(ctx: TenantContext, clientId: number): Promise<boolean> {
    return this.clientsByArtisan.get(ctx.artisanId)?.has(clientId) ?? false;
  }
}
