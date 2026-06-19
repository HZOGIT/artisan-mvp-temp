import type { TenantContext } from "../../../shared/tenant";
import type { IContratRepository, ContratAFacturerRow, RecordFactureRecurrenteInput } from "../application/contrat-repository";
import type {
  Contrat,
  ContratStatut,
  CreateContratInput,
  UpdateContratInput,
  ContratIntervention,
  CreateContratInterventionInput,
  UpdateContratInterventionInput,
} from "../domain/contrat";

/*
 * Implémentation in-memory du repository contrats-maintenance (tests sans DB). Reproduit les
 * invariants du repo Drizzle : scope par artisanId, artisanId forcé, statut="actif" à la création,
 * reference passée en argument, update qui ne touche pas le statut, setStatut pour les transitions,
 * ownsClient via Set seedable, nextReference compteur en mémoire par tenant.
 */
export class FakeContratRepository implements IContratRepository {
  private readonly store: Contrat[] = [];
  private seq = 0;
  private readonly clientsByArtisan = new Map<number, Set<number>>();
  private readonly clientNoms = new Map<string, string>();
  private readonly refCounter = new Map<number, number>();
  private readonly interventions: ContratIntervention[] = [];
  private interventionSeq = 0;
  // Factures récurrentes enregistrées (exposées pour les assertions de test).
  readonly facturesRecurrentes: RecordFactureRecurrenteInput[] = [];

  seedClient(artisanId: number, clientId: number, nom = "Client"): void {
    if (!this.clientsByArtisan.has(artisanId)) this.clientsByArtisan.set(artisanId, new Set());
    this.clientsByArtisan.get(artisanId)!.add(clientId);
    this.clientNoms.set(`${artisanId}:${clientId}`, nom);
  }

  private scoped(ctx: TenantContext): Contrat[] {
    return this.store.filter((c) => c.artisanId === ctx.artisanId);
  }

  async list(ctx: TenantContext): Promise<Contrat[]> {
    return [...this.scoped(ctx)].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id);
  }

  async getById(ctx: TenantContext, id: number): Promise<Contrat | null> {
    return this.scoped(ctx).find((c) => c.id === id) ?? null;
  }

  async create(ctx: TenantContext, input: CreateContratInput, reference: string): Promise<Contrat> {
    const now = new Date();
    const contrat: Contrat = {
      id: ++this.seq,
      artisanId: ctx.artisanId,
      clientId: input.clientId,
      reference,
      titre: input.titre,
      description: input.description ?? null,
      type: input.type ?? "entretien",
      montantHT: input.montantHT,
      tauxTVA: input.tauxTVA ?? "20.00",
      periodicite: input.periodicite,
      dateDebut: input.dateDebut,
      dateFin: input.dateFin ?? null,
      reconduction: input.reconduction ?? true,
      preavisResiliation: input.preavisResiliation ?? 1,
      prochainFacturation: input.prochainFacturation ?? null,
      prochainPassage: input.prochainPassage ?? null,
      conditionsParticulieres: input.conditionsParticulieres ?? null,
      statut: "actif", // forcé
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.store.push(contrat);
    return contrat;
  }

  async update(ctx: TenantContext, id: number, input: UpdateContratInput): Promise<Contrat | null> {
    const idx = this.store.findIndex((c) => c.id === id && c.artisanId === ctx.artisanId);
    if (idx === -1) return null;
    const current = this.store[idx];
    const next: Contrat = {
      ...current,
      ...(input.titre !== undefined ? { titre: input.titre } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.montantHT !== undefined ? { montantHT: input.montantHT } : {}),
      ...(input.tauxTVA !== undefined ? { tauxTVA: input.tauxTVA } : {}),
      ...(input.periodicite !== undefined ? { periodicite: input.periodicite } : {}),
      ...(input.dateDebut !== undefined ? { dateDebut: input.dateDebut } : {}),
      ...(input.dateFin !== undefined ? { dateFin: input.dateFin } : {}),
      ...(input.reconduction !== undefined ? { reconduction: input.reconduction } : {}),
      ...(input.preavisResiliation !== undefined ? { preavisResiliation: input.preavisResiliation } : {}),
      ...(input.prochainFacturation !== undefined ? { prochainFacturation: input.prochainFacturation } : {}),
      ...(input.prochainPassage !== undefined ? { prochainPassage: input.prochainPassage } : {}),
      ...(input.conditionsParticulieres !== undefined ? { conditionsParticulieres: input.conditionsParticulieres } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      // statut/reference/clientId jamais touchés par update
      updatedAt: new Date(),
    };
    this.store[idx] = next;
    return next;
  }

  async setStatut(ctx: TenantContext, id: number, statut: ContratStatut): Promise<Contrat | null> {
    const idx = this.store.findIndex((c) => c.id === id && c.artisanId === ctx.artisanId);
    if (idx === -1) return null;
    this.store[idx] = { ...this.store[idx], statut, updatedAt: new Date() };
    return this.store[idx];
  }

  async delete(ctx: TenantContext, id: number): Promise<boolean> {
    const idx = this.store.findIndex((c) => c.id === id && c.artisanId === ctx.artisanId);
    if (idx === -1) return false;
    this.store.splice(idx, 1);
    return true;
  }

  async ownsClient(ctx: TenantContext, clientId: number): Promise<boolean> {
    return this.clientsByArtisan.get(ctx.artisanId)?.has(clientId) ?? false;
  }

  async nextReference(ctx: TenantContext): Promise<string> {
    const prochain = (this.refCounter.get(ctx.artisanId) ?? 0) + 1;
    this.refCounter.set(ctx.artisanId, prochain);
    return `CTR-${String(prochain).padStart(5, "0")}`;
  }

  async listAFacturer(ctx: TenantContext): Promise<ContratAFacturerRow[]> {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    return this.scoped(ctx)
      .filter((c) => c.statut === "actif" && c.prochainFacturation !== null && c.prochainFacturation <= endOfToday)
      .sort((a, b) => (a.prochainFacturation!.getTime() - b.prochainFacturation!.getTime()))
      .map((c) => ({ ...c, clientNom: this.clientNoms.get(`${ctx.artisanId}:${c.clientId}`) ?? "Client" }));
  }

  async listInterventions(ctx: TenantContext, contratId: number): Promise<ContratIntervention[]> {
    if (!(await this.getById(ctx, contratId))) return [];
    return this.interventions
      .filter((i) => i.contratId === contratId && i.artisanId === ctx.artisanId)
      .sort((a, b) => b.dateIntervention.getTime() - a.dateIntervention.getTime() || b.id - a.id);
  }

  async getInterventionById(ctx: TenantContext, id: number): Promise<ContratIntervention | null> {
    return this.interventions.find((i) => i.id === id && i.artisanId === ctx.artisanId) ?? null;
  }

  async createIntervention(ctx: TenantContext, input: CreateContratInterventionInput): Promise<ContratIntervention> {
    const now = new Date();
    const intervention: ContratIntervention = {
      id: ++this.interventionSeq,
      contratId: input.contratId,
      artisanId: ctx.artisanId, // forcé
      titre: input.titre,
      description: input.description ?? null,
      dateIntervention: input.dateIntervention,
      duree: input.duree ?? null,
      technicienNom: input.technicienNom ?? null,
      statut: "planifiee", // forcé
      rapport: null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.interventions.push(intervention);
    return intervention;
  }

  async updateIntervention(ctx: TenantContext, id: number, input: UpdateContratInterventionInput): Promise<ContratIntervention | null> {
    const idx = this.interventions.findIndex((i) => i.id === id && i.artisanId === ctx.artisanId);
    if (idx === -1) return null;
    const current = this.interventions[idx];
    const next: ContratIntervention = {
      ...current,
      ...(input.titre !== undefined ? { titre: input.titre } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.dateIntervention !== undefined ? { dateIntervention: input.dateIntervention } : {}),
      ...(input.duree !== undefined ? { duree: input.duree } : {}),
      ...(input.technicienNom !== undefined ? { technicienNom: input.technicienNom } : {}),
      ...(input.statut !== undefined ? { statut: input.statut } : {}),
      ...(input.rapport !== undefined ? { rapport: input.rapport } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      updatedAt: new Date(),
    };
    this.interventions[idx] = next;
    return next;
  }

  async recordFactureRecurrente(_ctx: TenantContext, input: RecordFactureRecurrenteInput): Promise<void> {
    this.facturesRecurrentes.push({ ...input, genereeAutomatiquement: input.genereeAutomatiquement ?? false });
  }
}
