import type { TenantContext } from "../../../shared/tenant";
import type { ICongeRepository, AjustementSolde, ReportSolde, SoldeResult } from "../application/conge-repository";
import type { Conge, CongeStatut, CreateCongeInput, UpdateCongeInput } from "../domain/conge";
import { periodeReference } from "../application/solde";

/*
 * Double in-memory du repository pour les tests de use-cases (sans DB). Reproduit le scoping
 * tenant et les valeurs par défaut PG (`statut` → en_attente, demi-journées → false). ⚠️
 * `update` ne touche pas statut/validePar/dateValidation (réservés au workflow d'approbation).
 */
export class FakeCongeRepository implements ICongeRepository {
  private store: Conge[] = [];
  private seq = 0;
  /** Techniciens appartenant à un tenant (injectable) : clé `${artisanId}:${technicienId}`. */
  private ownedTechniciens = new Set<string>();
  /** Lien utilisateur → fiche technicien (injectable) : clé `${artisanId}:${userId}` → technicienId. */
  private userTechnicien = new Map<string, number>();
  /** Solde décompté (joursPris) : clé `${artisanId}:${technicienId}:${type}:${periodeDebut}` → jours. */
  private joursPrisMap = new Map<string, number>();
  /** Jours reportés : clé `${artisanId}:${technicienId}:${type}:${periodeDebut}` → jours. */
  private joursReportesMap = new Map<string, number>();
  /** Date d'embauche par technicien (injectable) : clé `${artisanId}:${technicienId}`. */
  private technicienDates = new Map<string, Date>();

  /**
   * Aide de test : lit le total de jours pris pour une clé de solde.
   * `annee` utilisé pour dériver periodeDebut (juin→mai) si `periodeDebut` absent.
   */
  getJoursPris(artisanId: number, technicienId: number, type: string, annee: number, periodeDebutOverride?: string): number {
    if (periodeDebutOverride) {
      return this.joursPrisMap.get(`${artisanId}:${technicienId}:${type}:${periodeDebutOverride}`) ?? 0;
    }
    /** Somme des deux périodes d'une même année civile (rétrocompatibilité tests existants). */
    const p1 = `${annee - 1}-06-01`;
    const p2 = `${annee}-06-01`;
    return (
      (this.joursPrisMap.get(`${artisanId}:${technicienId}:${type}:${p1}`) ?? 0) +
      (this.joursPrisMap.get(`${artisanId}:${technicienId}:${type}:${p2}`) ?? 0)
    );
  }

  /** Aide de test : lit les jours reportés pour une période. */
  getJoursReportes(artisanId: number, technicienId: number, type: string, periodeDebut: string): number {
    return this.joursReportesMap.get(`${artisanId}:${technicienId}:${type}:${periodeDebut}`) ?? 0;
  }

  /** Aide de test : déclare qu'un technicien appartient au tenant. */
  registerTechnicien(artisanId: number, technicienId: number, dateEmbauche?: Date): void {
    this.ownedTechniciens.add(`${artisanId}:${technicienId}`);
    if (dateEmbauche) this.technicienDates.set(`${artisanId}:${technicienId}`, dateEmbauche);
  }

  /** Aide de test : lie un utilisateur à une fiche technicien (garde anti self-approbation). */
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
    /** `input` n'a pas statut/validePar/dateValidation → workflow intact. */
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

  async ajusterSolde(ctx: TenantContext, { technicienId, type, periodeDebut, deltaJours }: AjustementSolde): Promise<void> {
    const key = `${ctx.artisanId}:${technicienId}:${type}:${periodeDebut}`;
    const present = this.joursPrisMap.has(key);
    if (present) {
      this.joursPrisMap.set(key, (this.joursPrisMap.get(key) ?? 0) + deltaJours);
    } else if (deltaJours > 0) {
      this.joursPrisMap.set(key, deltaJours);
    }
  }

  async reporterSolde(ctx: TenantContext, { technicienId, type, periodeDebut, joursReportes }: ReportSolde): Promise<void> {
    const key = `${ctx.artisanId}:${technicienId}:${type}:${periodeDebut}`;
    this.joursReportesMap.set(key, joursReportes);
  }

  async getTechnicienDateEmbauche(ctx: TenantContext, technicienId: number): Promise<Date | null> {
    return this.technicienDates.get(`${ctx.artisanId}:${technicienId}`) ?? null;
  }

  async listTechniciensSolde(ctx: TenantContext, annee: number, periodeDebut?: string): Promise<Array<{ technicienId: number; dateEmbauche: Date; joursPris: number; joursReportes: number }>> {
    return Array.from(this.ownedTechniciens)
      .filter((key) => Number(key.split(":")[0]) === ctx.artisanId)
      .map((key) => {
        const [artId, techId] = key.split(":").map(Number);
        const soldeKey = periodeDebut
          ? `${artId}:${techId}:conge_paye:${periodeDebut}`
          : `${artId}:${techId}:conge_paye:${annee - 1}-06-01`;
        return {
          technicienId: techId,
          dateEmbauche: this.technicienDates.get(key) ?? new Date(0),
          joursPris: this.joursPrisMap.get(soldeKey) ?? 0,
          joursReportes: this.joursReportesMap.get(soldeKey) ?? 0,
        };
      });
  }

  async getSolde(ctx: TenantContext, technicienId: number, annee: number, periodeDebut?: string): Promise<SoldeResult[]> {
    const results: SoldeResult[] = [];
    for (const key of Array.from(this.joursPrisMap.keys())) {
      const parts = key.split(":");
      const [artId, techId, type, pd] = [parts[0], parts[1], parts[2], parts.slice(3).join(":")];
      if (Number(artId) !== ctx.artisanId || Number(techId) !== technicienId) continue;
      if (periodeDebut && pd !== periodeDebut) continue;
      if (!periodeDebut) {
        const { periodeDebut: pd1 } = { periodeDebut: `${annee - 1}-06-01` };
        const { periodeDebut: pd2 } = { periodeDebut: `${annee}-06-01` };
        if (pd !== pd1 && pd !== pd2) continue;
      }
      const joursPris = this.joursPrisMap.get(key) ?? 0;
      const joursReportes = this.joursReportesMap.get(key) ?? 0;
      const periode = periodeReference(pd);
      results.push({
        type: type as SoldeResult["type"],
        annee,
        periodeDebut: pd,
        periodeFin: periode.periodeFin,
        exercice: periode.exercice,
        soldeInitial: 0,
        soldeRestant: 0,
        joursAcquis: 0,
        joursPris,
        joursReportes,
      });
    }
    return results;
  }

  async hasOverlap(
    ctx: TenantContext,
    { technicienId, dateDebut, dateFin, excludeId }: { technicienId: number; dateDebut: string; dateFin: string; excludeId?: number },
  ): Promise<boolean> {
    return this.store.some(
      (c) =>
        c.artisanId === ctx.artisanId &&
        c.technicienId === technicienId &&
        !["annule", "refuse"].includes(c.statut) &&
        c.dateDebut <= dateFin &&
        c.dateFin >= dateDebut &&
        (!excludeId || c.id !== excludeId),
    );
  }

  withDb(_db: unknown): this {
    return this;
  }
}
