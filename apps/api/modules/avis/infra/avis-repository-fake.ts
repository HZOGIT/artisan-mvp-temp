import type { TenantContext } from "../../../shared/tenant";
import type { IAvisRepository } from "../application/avis-repository";
import type { Avis, AvisClientResume, AvisEnrichi, AvisInterventionResume, AvisStats, StatutAvis } from "../domain/avis";

/*
 * Entrée de seed pour les tests (le port n'expose pas de create : les avis naissent
 * côté public/portail client). `seed` est un utilitaire de test, hors contrat.
 */
export interface SeedAvisInput {
  readonly artisanId: number;
  readonly clientId?: number;
  readonly interventionId?: number | null;
  readonly note: number;
  readonly commentaire?: string | null;
  readonly statut?: StatutAvis;
}

interface SeedClient extends AvisClientResume {
  readonly artisanId: number;
}
interface SeedIntervention extends AvisInterventionResume {
  readonly artisanId: number;
}

/*
 * Double in-memory du repository pour les tests de use-cases (sans DB). Reproduit le
 * scoping tenant : artisanId forcé du contexte, ressource hors tenant invisible.
 */
export class FakeAvisRepository implements IAvisRepository {
  private store: Avis[] = [];
  private clientsStore: SeedClient[] = [];
  private interventionsStore: SeedIntervention[] = [];
  private seq = 0;

  /** Utilitaires de test (hors port) pour alimenter les jointures enrichies. */
  seedClient(c: SeedClient): void {
    this.clientsStore.push(c);
  }
  seedIntervention(i: SeedIntervention): void {
    this.interventionsStore.push(i);
  }

  /** Utilitaire de test (hors port) : insère un avis appartenant à un tenant donné. */
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

  async listEnrichi(ctx: TenantContext): Promise<AvisEnrichi[]> {
    const liste = await this.list(ctx);
    return liste.map((a) => {
      /** Résumés scopés tenant : un client/intervention d'un autre artisan n'est jamais joint. */
      const c = this.clientsStore.find((x) => x.id === a.clientId && x.artisanId === ctx.artisanId);
      const i =
        a.interventionId != null
          ? this.interventionsStore.find((x) => x.id === a.interventionId && x.artisanId === ctx.artisanId)
          : undefined;
      return {
        ...a,
        client: c ? { id: c.id, nom: c.nom, prenom: c.prenom, email: c.email } : null,
        intervention: i ? { id: i.id, titre: i.titre, dateDebut: i.dateDebut } : null,
      };
    });
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
