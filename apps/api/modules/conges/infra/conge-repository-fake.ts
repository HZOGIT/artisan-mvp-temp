import type { TenantContext } from "../../../shared/tenant";
import type { ICongeRepository, AjustementSolde } from "../application/conge-repository";
import type { Conge, CongeStatut, CreateCongeInput, UpdateCongeInput } from "../domain/conge";

/*
 * Double in-memory du repository pour les tests de use-cases (sans DB). Reproduit le scoping
 * tenant et les valeurs par défaut PG (`statut` → en_attente, demi-journées → false). ⚠️
 * `update` ne touche pas statut/validePar/dateValidation (réservés au workflow d'approbation).
 */
export class FakeCongeRepository implements ICongeRepository {
  private store: Conge[] = [];
  private seq = 0;
  // Techniciens appartenant à un tenant (injectable) : clé `${artisanId}:${technicienId}`.
  private ownedTechniciens = new Set<string>();
  // Lien utilisateur → fiche technicien (injectable) : clé `${artisanId}:${userId}` → technicienId.
  private userTechnicien = new Map<string, number>();
  // Solde décompté (joursPris) : clé `${artisanId}:${technicienId}:${type}:${annee}` → jours.
  private joursPris = new Map<string, number>();

  // Aide de test : lit le total de jours pris (décompté) pour une clé de solde.
  getJoursPris(artisanId: number, technicienId: number, type: string, annee: number): number {
    return this.joursPris.get(`${artisanId}:${technicienId}:${type}:${annee}`) ?? 0;
  }

  // Aide de test : déclare qu'un technicien appartient au tenant.
  registerTechnicien(artisanId: number, technicienId: number): void {
    this.ownedTechniciens.add(`${artisanId}:${technicienId}`);
  }

  // Aide de test : lie un utilisateur à une fiche technicien (garde anti self-approbation).
  linkTechnicien(artisanId: number, userId: number, technicienId: number): void {
    this.userTechnicien.set(`${artisanId}:${userId}`, technicienId);
  }

  async list(ctx: TenantContext): Promise<Conge[]> {
    return this.store.filter((c) => c.artisanId === ctx.artisanId);
  }

  async listEnAttente(ctx: TenantContext): Promise<Conge[]> {
    return this.store
      .filter((c) => c.artisanId === ctx.artisanId && c.statut === "en_attente")
      .sort((a, b) => a.dateDebut.localeCompare(b.dateDebut));
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

  async findTechnicienIdForUser(ctx: TenantContext): Promise<number | null> {
    return this.userTechnicien.get(`${ctx.artisanId}:${ctx.userId}`) ?? null;
  }

  async setStatut(
    ctx: TenantContext,
    id: number,
    statut: CongeStatut,
    validePar: number,
    commentaire?: string | null,
  ): Promise<Conge | null> {
    const c = await this.getById(ctx, id);
    if (!c) return null;
    const updated: Conge = {
      ...c,
      statut,
      validePar,
      dateValidation: new Date(),
      commentaireValidation: commentaire ?? null,
      updatedAt: new Date(),
    };
    this.store = this.store.map((x) => (x.id === id ? updated : x));
    return updated;
  }

  async ajusterSolde(ctx: TenantContext, { technicienId, type, annee, deltaJours }: AjustementSolde): Promise<void> {
    const key = `${ctx.artisanId}:${technicienId}:${type}:${annee}`;
    const present = this.joursPris.has(key);
    if (present) {
      this.joursPris.set(key, (this.joursPris.get(key) ?? 0) + deltaJours);
    } else if (deltaJours > 0) {
      this.joursPris.set(key, deltaJours);
    }
    // absente + recrédit (≤0) → no-op
  }
}
