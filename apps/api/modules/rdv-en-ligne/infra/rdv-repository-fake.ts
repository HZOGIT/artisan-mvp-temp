import type { DbClient } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IRdvRepository, SetStatutOptions } from "../application/rdv-repository";
import type { CreateRdvInput, Rdv, RdvStatut, UpdateRdvInput } from "../domain/rdv";

/*
 * Implémentation in-memory du repository rdv-en-ligne (tests sans DB). Reproduit les invariants du
 * repo Drizzle : scope par artisanId, artisanId forcé, statut="en_attente" à la création, update qui
 * ne touche pas le statut, setStatut pour les transitions, ownsClient via un Set seedable.
 */
export class FakeRdvRepository implements IRdvRepository {
  private readonly store: Rdv[] = [];
  private seq = 0;
  /** Clients possédés, par artisanId (seedés par les tests pour simuler l'anti-IDOR). */
  private readonly clientsByArtisan = new Map<number, Set<number>>();

  /** Déclare qu'un client appartient à un artisan (pour les tests d'anti-IDOR-FK). */
  seedClient(artisanId: number, clientId: number): void {
    if (!this.clientsByArtisan.has(artisanId)) this.clientsByArtisan.set(artisanId, new Set());
    const artisanClients = this.clientsByArtisan.get(artisanId);
    if (artisanClients) artisanClients.add(clientId);
  }

  private scoped(ctx: TenantContext): Rdv[] {
    return this.store.filter((r) => r.artisanId === ctx.artisanId);
  }

  async list(ctx: TenantContext): Promise<Rdv[]> {
    return [...this.scoped(ctx)].sort((a, b) => b.dateProposee.getTime() - a.dateProposee.getTime() || b.id - a.id);
  }

  async getById(ctx: TenantContext, id: number): Promise<Rdv | null> {
    return this.scoped(ctx).find((r) => r.id === id) ?? null;
  }

  async create(ctx: TenantContext, input: CreateRdvInput): Promise<Rdv> {
    const now = new Date();
    const rdv: Rdv = {
      id: ++this.seq,
      artisanId: ctx.artisanId,
      clientId: input.clientId,
      titre: input.titre,
      description: input.description ?? null,
      dateProposee: input.dateProposee,
      dureeEstimee: input.dureeEstimee ?? 60,
      /** forcé */
      statut: "en_attente",
      motifRefus: null,
      urgence: input.urgence ?? "normale",
      interventionId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.store.push(rdv);
    return rdv;
  }

  async update(ctx: TenantContext, id: number, input: UpdateRdvInput): Promise<Rdv | null> {
    const idx = this.store.findIndex((r) => r.id === id && r.artisanId === ctx.artisanId);
    if (idx === -1) return null;
    const current = this.store[idx];
    const next: Rdv = {
      ...current,
      ...(input.titre !== undefined ? { titre: input.titre } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.dateProposee !== undefined ? { dateProposee: input.dateProposee } : {}),
      ...(input.dureeEstimee !== undefined ? { dureeEstimee: input.dureeEstimee } : {}),
      ...(input.urgence !== undefined ? { urgence: input.urgence } : {}),
      /** statut/motifRefus jamais touchés par update */
      updatedAt: new Date(),
    };
    this.store[idx] = next;
    return next;
  }

  async setStatut(ctx: TenantContext, id: number, statut: RdvStatut, options?: SetStatutOptions): Promise<Rdv | null> {
    const idx = this.store.findIndex((r) => r.id === id && r.artisanId === ctx.artisanId);
    if (idx === -1) return null;
    const next: Rdv = {
      ...this.store[idx],
      statut,
      ...(options?.motifRefus !== undefined ? { motifRefus: options.motifRefus } : {}),
      ...(options?.interventionId !== undefined ? { interventionId: options.interventionId } : {}),
      updatedAt: new Date(),
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

  async ownsClient(ctx: TenantContext, clientId: number): Promise<boolean> {
    return this.clientsByArtisan.get(ctx.artisanId)?.has(clientId) ?? false;
  }

  withDb(_db: DbClient): FakeRdvRepository {
    return this;
  }
}
