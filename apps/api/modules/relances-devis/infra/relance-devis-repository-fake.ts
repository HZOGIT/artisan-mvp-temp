import type { TenantContext } from "../../../shared/tenant";
import type { IRelanceDevisRepository } from "../application/relance-devis-repository";
import type { CreateRelanceInput, RelanceDevis } from "../domain/relance-devis";

/*
 * Implémentation in-memory du repository relances-devis (tests sans DB). Reproduit les invariants du
 * repo Drizzle : scope par artisanId, artisanId forcé, statut défaut "envoye", pas d'update
 * (immuabilité), ownsDevis via un Set de devisIds seedable.
 */
export class FakeRelanceDevisRepository implements IRelanceDevisRepository {
  private readonly store: RelanceDevis[] = [];
  private seq = 0;
  private readonly devisByArtisan = new Map<number, Set<number>>();

  /** Déclare qu'un devis appartient à un artisan (pour les tests d'anti-IDOR-FK). */
  seedDevis(artisanId: number, devisId: number): void {
    if (!this.devisByArtisan.has(artisanId)) this.devisByArtisan.set(artisanId, new Set());
    const artisanDevis = this.devisByArtisan.get(artisanId);
    if (artisanDevis) artisanDevis.add(devisId);
  }

  private scoped(ctx: TenantContext): RelanceDevis[] {
    return this.store.filter((r) => r.artisanId === ctx.artisanId);
  }

  async list(ctx: TenantContext): Promise<RelanceDevis[]> {
    return [...this.scoped(ctx)].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id);
  }

  async listByDevis(ctx: TenantContext, devisId: number): Promise<RelanceDevis[]> {
    return (await this.list(ctx)).filter((r) => r.devisId === devisId);
  }

  async getById(ctx: TenantContext, id: number): Promise<RelanceDevis | null> {
    return this.scoped(ctx).find((r) => r.id === id) ?? null;
  }

  async create(ctx: TenantContext, input: CreateRelanceInput): Promise<RelanceDevis> {
    const relance: RelanceDevis = {
      id: ++this.seq,
      devisId: input.devisId,
      artisanId: ctx.artisanId,
      type: input.type,
      destinataire: input.destinataire ?? null,
      message: input.message ?? null,
      statut: input.statut ?? "envoye",
      createdAt: new Date(),
    };
    this.store.push(relance);
    return relance;
  }

  async delete(ctx: TenantContext, id: number): Promise<boolean> {
    const idx = this.store.findIndex((r) => r.id === id && r.artisanId === ctx.artisanId);
    if (idx === -1) return false;
    this.store.splice(idx, 1);
    return true;
  }

  async ownsDevis(ctx: TenantContext, devisId: number): Promise<boolean> {
    return this.devisByArtisan.get(ctx.artisanId)?.has(devisId) ?? false;
  }
}
