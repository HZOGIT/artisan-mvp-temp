import type { TenantContext } from "../../../shared/tenant";
import type { IBadgeRepository } from "../application/badge-repository";
import type { Badge, BadgeTechnicien, CreateBadgeInput, UpdateBadgeInput } from "../domain/badge";
import type { ClassementEntry, PeriodeClassement } from "../domain/classement";

// Double in-memory du repository badges pour les tests de use-cases (sans DB). Reproduit
// le scoping tenant (artisanId forcé du contexte) ET l'anti-IDOR sur badges_techniciens :
// un technicien doit avoir été déclaré (seedTechnicien) comme appartenant à un tenant,
// sinon attribuer/listBadgesTechnicien refusent (null/[]).
export class FakeBadgeRepository implements IBadgeRepository {
  private badgesStore: Badge[] = [];
  private attributions: BadgeTechnicien[] = [];
  private techniciens: Array<{ id: number; artisanId: number }> = [];
  private classementStore: ClassementEntry[] = [];
  private seq = 0;
  private attrSeq = 0;

  // Utilitaire de test (hors port) : déclare un technicien appartenant à un tenant.
  seedTechnicien(id: number, artisanId: number): void {
    this.techniciens.push({ id, artisanId });
  }

  // Utilitaire de test (hors port) : ajoute une ligne de classement.
  seedClassement(entry: ClassementEntry): void {
    this.classementStore.push(entry);
  }

  private ownsTechnicien(ctx: TenantContext, technicienId: number): boolean {
    return this.techniciens.some((t) => t.id === technicienId && t.artisanId === ctx.artisanId);
  }

  async list(ctx: TenantContext): Promise<Badge[]> {
    return this.badgesStore.filter((b) => b.artisanId === ctx.artisanId);
  }

  async getById(ctx: TenantContext, id: number): Promise<Badge | null> {
    return this.badgesStore.find((b) => b.id === id && b.artisanId === ctx.artisanId) ?? null;
  }

  async create(ctx: TenantContext, input: CreateBadgeInput): Promise<Badge> {
    const b: Badge = {
      id: ++this.seq,
      artisanId: ctx.artisanId,
      code: input.code,
      nom: input.nom,
      description: input.description ?? null,
      icone: input.icone ?? null,
      couleur: input.couleur ?? null,
      categorie: input.categorie ?? "interventions",
      condition: input.condition ?? null,
      seuil: input.seuil ?? null,
      points: input.points ?? 10,
      actif: input.actif ?? true,
      createdAt: new Date(),
    };
    this.badgesStore.push(b);
    return b;
  }

  async update(ctx: TenantContext, id: number, input: UpdateBadgeInput): Promise<Badge | null> {
    const b = await this.getById(ctx, id);
    if (!b) return null;
    const updated: Badge = { ...b, ...input };
    this.badgesStore = this.badgesStore.map((x) => (x.id === id ? updated : x));
    return updated;
  }

  async delete(ctx: TenantContext, id: number): Promise<boolean> {
    const b = await this.getById(ctx, id);
    if (!b) return false;
    this.badgesStore = this.badgesStore.filter((x) => x.id !== id);
    this.attributions = this.attributions.filter((a) => a.badgeId !== id);
    return true;
  }

  async listBadgesTechnicien(ctx: TenantContext, technicienId: number): Promise<BadgeTechnicien[]> {
    if (!this.ownsTechnicien(ctx, technicienId)) return [];
    return this.attributions.filter((a) => a.technicienId === technicienId);
  }

  async attribuer(
    ctx: TenantContext,
    technicienId: number,
    badgeId: number,
    valeurAtteinte?: number | null,
  ): Promise<BadgeTechnicien | null> {
    if (!this.ownsTechnicien(ctx, technicienId)) return null;
    if (!(await this.getById(ctx, badgeId))) return null; // badge hors tenant
    const existing = this.attributions.find((a) => a.technicienId === technicienId && a.badgeId === badgeId);
    if (existing) return existing;
    const at: BadgeTechnicien = {
      id: ++this.attrSeq,
      technicienId,
      badgeId,
      dateObtention: new Date(),
      valeurAtteinte: valeurAtteinte ?? null,
      notifie: false,
    };
    this.attributions.push(at);
    return at;
  }

  async getClassement(ctx: TenantContext, periode: PeriodeClassement): Promise<ClassementEntry[]> {
    return this.classementStore
      .filter((c) => c.artisanId === ctx.artisanId && c.periode === periode)
      .sort((a, b) => a.rang - b.rang);
  }

  // Recompute no-op (l'agrégation SQL interventions/factures est testée en PG) :
  // renvoie le classement déjà seedé pour la période, scopé tenant.
  async recalculerClassement(ctx: TenantContext, periode: PeriodeClassement): Promise<ClassementEntry[]> {
    return this.getClassement(ctx, periode);
  }
}
