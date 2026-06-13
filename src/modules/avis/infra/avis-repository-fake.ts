import type { TenantContext } from "../../../shared/tenant";
import type { IAvisRepository } from "../application/avis-repository";
import type { Avis, AvisStats, StatutAvis } from "../domain/avis";

// Entrée de seed pour les tests (le port n'expose pas de create : les avis naissent
// côté public/portail client). `seed` est un utilitaire de test, hors contrat.
export interface SeedAvisInput {
  readonly artisanId: number;
  readonly clientId?: number;
  readonly interventionId?: number | null;
  readonly note: number;
  readonly commentaire?: string | null;
  readonly statut?: StatutAvis;
}

// Double in-memory du repository pour les tests de use-cases (sans DB). Reproduit le
// scoping tenant : artisanId forcé du contexte, ressource hors tenant invisible.
export class FakeAvisRepository implements IAvisRepository {
  private store: Avis[] = [];
  private seq = 0;

  // Utilitaire de test (hors port) : insère un avis appartenant à un tenant donné.
  seed(input: SeedAvisInput): Avis {
    const now = new Date();
    const avis: Avis = {
      id: ++this.seq,
      artisanId: input.artisanId,
      clientId: input.clientId ?? 1,
      interventionId: input.interventionId ?? null,
      note: input.note,
      commentaire: input.commentaire ?? null,
      tokenAvis: null,
      reponseArtisan: null,
      reponseAt: null,
      statut: input.statut ?? "publie",
      createdAt: now,
      updatedAt: now,
    };
    this.store.push(avis);
    return avis;
  }

  async list(ctx: TenantContext): Promise<Avis[]> {
    return this.store
      .filter((a) => a.artisanId === ctx.artisanId)
      .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime() || y.id - x.id);
  }

  async getById(ctx: TenantContext, id: number): Promise<Avis | null> {
    return this.store.find((a) => a.id === id && a.artisanId === ctx.artisanId) ?? null;
  }

  async getStats(ctx: TenantContext): Promise<AvisStats> {
    const publies = this.store.filter((a) => a.artisanId === ctx.artisanId && a.statut === "publie");
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as AvisStats["distribution"];
    let somme = 0;
    for (const a of publies) {
      if (a.note >= 1 && a.note <= 5) (distribution as Record<number, number>)[a.note] += 1;
      somme += a.note;
    }
    const total = publies.length;
    const moyenne = total > 0 ? Math.round((somme / total) * 10) / 10 : 0;
    return { moyenne, total, distribution };
  }

  async repondre(ctx: TenantContext, id: number, reponse: string): Promise<Avis | null> {
    const idx = this.store.findIndex((a) => a.id === id && a.artisanId === ctx.artisanId);
    if (idx < 0) return null;
    const updated: Avis = { ...this.store[idx], reponseArtisan: reponse, reponseAt: new Date(), updatedAt: new Date() };
    this.store[idx] = updated;
    return updated;
  }

  async changerStatut(ctx: TenantContext, id: number, statut: StatutAvis): Promise<Avis | null> {
    const idx = this.store.findIndex((a) => a.id === id && a.artisanId === ctx.artisanId);
    if (idx < 0) return null;
    const updated: Avis = { ...this.store[idx], statut, updatedAt: new Date() };
    this.store[idx] = updated;
    return updated;
  }
}
