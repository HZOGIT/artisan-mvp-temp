import type { TenantContext } from "../../../shared/tenant";
import type { IChantierRepository } from "../application/chantier-repository";
import type {
  Chantier,
  CreateChantierInput,
  UpdateChantierInput,
  ChantierPointage,
  CreatePointageInput,
  ChantierSuivi,
  CreateSuiviInput,
  UpdateSuiviInput,
  ChantierPhase,
  CreatePhaseInput,
  UpdatePhaseInput,
  ChantierInterventionLien,
  AssocierInterventionInput,
  ChantierDocument,
  AddDocumentInput,
} from "../domain/chantier";

/*
 * Double in-memory du repository pour les tests de use-cases (sans DB). Reproduit le scoping
 * tenant et les valeurs par défaut PG (statut planifie, priorite normale, avancement 0,
 * budgetRealise "0.00"). Aucune fuite cross-tenant ; `update` ne touche pas `clientId`.
 */
export class FakeChantierRepository implements IChantierRepository {
  private store: Chantier[] = [];
  private seq = 0;
  /** Clients appartenant à un tenant (injectable) : clé `${artisanId}:${clientId}`. */
  private ownedClients = new Set<string>();
  private ownedTechniciens = new Set<string>();
  private ownedInterventions = new Set<string>();
  private pointages: ChantierPointage[] = [];
  private pointageSeq = 0;

  /** Aide de test : déclare qu'un client appartient au tenant. */
  registerClient(artisanId: number, clientId: number): void {
    this.ownedClients.add(`${artisanId}:${clientId}`);
  }

  /** Aide de test : déclare qu'un technicien appartient au tenant. */
  registerTechnicien(artisanId: number, technicienId: number): void {
    this.ownedTechniciens.add(`${artisanId}:${technicienId}`);
  }

  /** Aide de test : déclare qu'une intervention appartient au tenant. */
  registerIntervention(artisanId: number, interventionId: number): void {
    this.ownedInterventions.add(`${artisanId}:${interventionId}`);
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
    /** `input` (UpdateChantierInput) n'a pas `clientId` → le client reste intact. */
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

  async ownsTechnicien(ctx: TenantContext, technicienId: number): Promise<boolean> {
    return this.ownedTechniciens.has(`${ctx.artisanId}:${technicienId}`);
  }

  private ownsChantier(ctx: TenantContext, chantierId: number): boolean {
    return this.store.some((c) => c.id === chantierId && c.artisanId === ctx.artisanId);
  }

  async listPointages(ctx: TenantContext, chantierId: number): Promise<ChantierPointage[]> {
    if (!this.ownsChantier(ctx, chantierId)) return [];
    return this.pointages
      .filter((p) => p.chantierId === chantierId)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id - b.id));
  }

  async addPointage(ctx: TenantContext, input: CreatePointageInput): Promise<ChantierPointage | null> {
    if (!this.ownsChantier(ctx, input.chantierId)) return null;
    const p: ChantierPointage = {
      id: ++this.pointageSeq,
      chantierId: input.chantierId,
      phaseId: input.phaseId ?? null,
      technicienId: input.technicienId ?? null,
      date: input.date,
      heures: input.heures,
      description: input.description ?? null,
      createdAt: new Date(),
    };
    this.pointages.push(p);
    return p;
  }

  async deletePointage(ctx: TenantContext, chantierId: number, id: number): Promise<boolean> {
    if (!this.ownsChantier(ctx, chantierId)) return false;
    const before = this.pointages.length;
    this.pointages = this.pointages.filter((p) => !(p.id === id && p.chantierId === chantierId));
    return this.pointages.length < before;
  }

  /** ⚠️ suivi_chantier sans artisanId : ces méthodes ne scopent PAS (le use-case garde l'ownership). */
  private suivis: ChantierSuivi[] = [];
  private suiviSeq = 0;

  async listSuivi(_ctx: TenantContext, chantierId: number): Promise<ChantierSuivi[]> {
    return this.suivis.filter((s) => s.chantierId === chantierId).sort((a, b) => a.ordre - b.ordre || a.id - b.id);
  }

  async getSuiviById(_ctx: TenantContext, id: number): Promise<ChantierSuivi | null> {
    return this.suivis.find((s) => s.id === id) ?? null;
  }

  async addSuivi(_ctx: TenantContext, input: CreateSuiviInput): Promise<ChantierSuivi> {
    const now = new Date();
    const s: ChantierSuivi = {
      id: ++this.suiviSeq,
      chantierId: input.chantierId,
      titre: input.titre,
      description: input.description ?? null,
      statut: input.statut ?? "a_faire",
      pourcentage: input.pourcentage ?? 0,
      ordre: input.ordre ?? 1,
      visibleClient: input.visibleClient ?? true,
      dateDebut: input.dateDebut ?? null,
      dateFin: input.dateFin ?? null,
      commentaire: input.commentaire ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.suivis.push(s);
    return s;
  }

  async updateSuivi(_ctx: TenantContext, id: number, input: UpdateSuiviInput): Promise<ChantierSuivi | null> {
    const idx = this.suivis.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    const cur = this.suivis[idx];
    const next: ChantierSuivi = {
      ...cur,
      ...(input.titre !== undefined ? { titre: input.titre } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.statut !== undefined ? { statut: input.statut } : {}),
      ...(input.pourcentage !== undefined ? { pourcentage: input.pourcentage } : {}),
      ...(input.ordre !== undefined ? { ordre: input.ordre } : {}),
      ...(input.visibleClient !== undefined ? { visibleClient: input.visibleClient } : {}),
      ...(input.dateDebut !== undefined ? { dateDebut: input.dateDebut } : {}),
      ...(input.dateFin !== undefined ? { dateFin: input.dateFin } : {}),
      ...(input.commentaire !== undefined ? { commentaire: input.commentaire } : {}),
      updatedAt: new Date(),
    };
    this.suivis[idx] = next;
    return next;
  }

  async deleteSuivi(_ctx: TenantContext, id: number): Promise<boolean> {
    const before = this.suivis.length;
    this.suivis = this.suivis.filter((s) => s.id !== id);
    return this.suivis.length < before;
  }

  /** ⚠️ phases_chantier sans artisanId : ces méthodes ne scopent PAS (le use-case garde l'ownership). */
  private phases: ChantierPhase[] = [];
  private phaseSeq = 0;

  async listPhases(_ctx: TenantContext, chantierId: number): Promise<ChantierPhase[]> {
    return this.phases.filter((p) => p.chantierId === chantierId).sort((a, b) => a.ordre - b.ordre || a.id - b.id);
  }

  async getPhaseById(_ctx: TenantContext, id: number): Promise<ChantierPhase | null> {
    return this.phases.find((p) => p.id === id) ?? null;
  }

  async addPhase(_ctx: TenantContext, input: CreatePhaseInput): Promise<ChantierPhase> {
    const p: ChantierPhase = {
      id: ++this.phaseSeq,
      chantierId: input.chantierId,
      nom: input.nom,
      description: input.description ?? null,
      ordre: input.ordre ?? 1,
      dateDebutPrevue: input.dateDebutPrevue ?? null,
      dateFinPrevue: input.dateFinPrevue ?? null,
      dateDebutReelle: null,
      dateFinReelle: null,
      statut: "a_faire",
      avancement: 0,
      budgetPhase: input.budgetPhase ?? null,
      coutReel: "0.00",
      heuresPrevues: input.heuresPrevues ?? null,
      createdAt: new Date(),
    };
    this.phases.push(p);
    return p;
  }

  async updatePhase(_ctx: TenantContext, id: number, input: UpdatePhaseInput): Promise<ChantierPhase | null> {
    const idx = this.phases.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    const cur = this.phases[idx];
    const next: ChantierPhase = {
      ...cur,
      ...(input.nom !== undefined ? { nom: input.nom } : {}),
      ...(input.statut !== undefined ? { statut: input.statut } : {}),
      ...(input.avancement !== undefined ? { avancement: input.avancement } : {}),
      ...(input.dateDebutReelle !== undefined ? { dateDebutReelle: input.dateDebutReelle } : {}),
      ...(input.dateFinReelle !== undefined ? { dateFinReelle: input.dateFinReelle } : {}),
      ...(input.coutReel !== undefined ? { coutReel: input.coutReel } : {}),
      ...(input.heuresPrevues !== undefined ? { heuresPrevues: input.heuresPrevues } : {}),
    };
    this.phases[idx] = next;
    return next;
  }

  async deletePhase(_ctx: TenantContext, id: number): Promise<boolean> {
    const before = this.phases.length;
    this.phases = this.phases.filter((p) => p.id !== id);
    return this.phases.length < before;
  }

  /** ⚠️ interventions_chantier sans artisanId : scopé via le chantier parent (use-case). */
  private liens: ChantierInterventionLien[] = [];
  private lienSeq = 0;

  async ownsIntervention(ctx: TenantContext, interventionId: number): Promise<boolean> {
    return this.ownedInterventions.has(`${ctx.artisanId}:${interventionId}`);
  }

  async listInterventionsLiens(_ctx: TenantContext, chantierId: number): Promise<ChantierInterventionLien[]> {
    return this.liens.filter((l) => l.chantierId === chantierId).sort((a, b) => a.ordre - b.ordre || a.id - b.id);
  }

  async listAllInterventionsLiens(ctx: TenantContext): Promise<ChantierInterventionLien[]> {
    const chantierIds = new Set(this.store.filter((c) => c.artisanId === ctx.artisanId).map((c) => c.id));
    return this.liens.filter((l) => chantierIds.has(l.chantierId)).sort((a, b) => a.ordre - b.ordre || a.id - b.id);
  }

  async associerIntervention(_ctx: TenantContext, input: AssocierInterventionInput): Promise<ChantierInterventionLien> {
    const existing = this.liens.find((l) => l.chantierId === input.chantierId && l.interventionId === input.interventionId);
    if (existing) return existing;
    const l: ChantierInterventionLien = {
      id: ++this.lienSeq,
      chantierId: input.chantierId,
      interventionId: input.interventionId,
      phaseId: input.phaseId ?? null,
      ordre: input.ordre ?? 1,
      createdAt: new Date(),
    };
    this.liens.push(l);
    return l;
  }

  async dissocierIntervention(_ctx: TenantContext, chantierId: number, interventionId: number): Promise<boolean> {
    const before = this.liens.length;
    this.liens = this.liens.filter((l) => !(l.chantierId === chantierId && l.interventionId === interventionId));
    return this.liens.length < before;
  }

  /** ⚠️ documents_chantier sans artisanId : scopé via le chantier parent (use-case). */
  private documents: ChantierDocument[] = [];
  private documentSeq = 0;

  async listDocuments(_ctx: TenantContext, chantierId: number): Promise<ChantierDocument[]> {
    return this.documents
      .filter((d) => d.chantierId === chantierId)
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime() || b.id - a.id);
  }

  async getDocumentById(_ctx: TenantContext, id: number): Promise<ChantierDocument | null> {
    return this.documents.find((d) => d.id === id) ?? null;
  }

  async addDocument(_ctx: TenantContext, input: AddDocumentInput): Promise<ChantierDocument> {
    const d: ChantierDocument = {
      id: ++this.documentSeq,
      chantierId: input.chantierId,
      nom: input.nom,
      type: input.type ?? "autre",
      url: input.url,
      taille: input.taille ?? null,
      uploadedAt: new Date(),
    };
    this.documents.push(d);
    return d;
  }

  async deleteDocument(_ctx: TenantContext, id: number): Promise<boolean> {
    const before = this.documents.length;
    this.documents = this.documents.filter((d) => d.id !== id);
    return this.documents.length < before;
  }

  /*
   * ── Statistiques ──────────────────────────────────────────────────────────────────────────────
   * Aide de test : somme TTC des dépenses rattachées à un chantier (clé `${artisanId}:${chantierId}`).
   */
  private depensesTtc = new Map<string, string>();

  /** Aide de test : déclare le total TTC des dépenses d'un chantier (pour `sumDepensesChantier`). */
  registerDepensesChantier(artisanId: number, chantierId: number, totalTtc: string): void {
    this.depensesTtc.set(`${artisanId}:${chantierId}`, totalTtc);
  }

  async sumDepensesChantier(ctx: TenantContext, chantierId: number): Promise<string> {
    return this.depensesTtc.get(`${ctx.artisanId}:${chantierId}`) ?? "0";
  }

  async setAvancement(ctx: TenantContext, chantierId: number, avancement: number): Promise<void> {
    const idx = this.store.findIndex((c) => c.id === chantierId && c.artisanId === ctx.artisanId);
    if (idx === -1) return;
    this.store[idx] = { ...this.store[idx], avancement, updatedAt: new Date() };
  }

  withDb(_db: unknown): this {
    return this;
  }
}
