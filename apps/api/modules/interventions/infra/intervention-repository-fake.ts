import type { TenantContext } from "../../../shared/tenant";
import type { IInterventionRepository, InterventionRefKind } from "../application/intervention-repository";
import type {
  Intervention,
  CreateInterventionInput,
  UpdateInterventionInput,
  EquipeMembre,
  EquipeMembreArtisan,
  AjouterMembreEquipeInput,
} from "../domain/intervention";

/*
 * Double in-memory du repository pour les tests de use-cases (sans DB). Reproduit le scoping
 * tenant et les valeurs par défaut PG (`statut` → planifiee). Aucune fuite cross-tenant.
 */
export class FakeInterventionRepository implements IInterventionRepository {
  private store: Intervention[] = [];
  private seq = 0;
  /** FK appartenant à un tenant (injectable) : clé `${artisanId}:${kind}:${id}` → owned. */
  private ownedRefs = new Set<string>();
  /** Lien utilisateur → fiche technicien (injectable) : clé `${artisanId}:${userId}` → technicienId. */
  private userTechnicien = new Map<string, number>();
  /** Équipe d'intervention (liaisons) + noms techniciens injectables (pour la jointure simulée). */
  private equipe: Array<{ id: number; artisanId: number; interventionId: number; technicienId: number; role: string | null }> = [];
  private equipeSeq = 0;
  private technicienNoms = new Map<string, { nom: string | null; prenom: string | null }>();

  /** Aide de test : nom/prénom d'une fiche technicien (jointure simulée de l'équipe). */
  setTechnicienNom(technicienId: number, nom: string | null, prenom: string | null): void {
    this.technicienNoms.set(String(technicienId), { nom, prenom });
  }

  /** Aide de test : déclare qu'une ressource référencée appartient au tenant. */
  registerRef(artisanId: number, kind: InterventionRefKind, id: number): void {
    this.ownedRefs.add(`${artisanId}:${kind}:${id}`);
  }

  /** Aide de test : lie un utilisateur à une fiche technicien dans un tenant. */
  linkTechnicien(artisanId: number, userId: number, technicienId: number): void {
    this.userTechnicien.set(`${artisanId}:${userId}`, technicienId);
  }

  async list(ctx: TenantContext): Promise<Intervention[]> {
    return this.store.filter((i) => i.artisanId === ctx.artisanId);
  }

  async getById(ctx: TenantContext, id: number): Promise<Intervention | null> {
    return this.store.find((i) => i.id === id && i.artisanId === ctx.artisanId) ?? null;
  }

  async create(ctx: TenantContext, input: CreateInterventionInput): Promise<Intervention> {
    const now = new Date();
    const i: Intervention = {
      id: ++this.seq,
      artisanId: ctx.artisanId,
      clientId: input.clientId,
      titre: input.titre,
      description: input.description ?? null,
      dateDebut: input.dateDebut,
      dateFin: input.dateFin ?? null,
      statut: input.statut ?? "planifiee",
      adresse: input.adresse ?? null,
      notes: input.notes ?? null,
      devisId: input.devisId ?? null,
      factureId: input.factureId ?? null,
      technicienId: input.technicienId ?? null,
      heureArrivee: null,
      heureDepart: null,
      createdAt: now,
      updatedAt: now,
    };
    this.store.push(i);
    return i;
  }

  async update(ctx: TenantContext, id: number, input: UpdateInterventionInput): Promise<Intervention | null> {
    const i = await this.getById(ctx, id);
    if (!i) return null;
    const updated: Intervention = { ...i, ...input, updatedAt: new Date() };
    this.store = this.store.map((x) => (x.id === id ? updated : x));
    return updated;
  }

  async delete(ctx: TenantContext, id: number): Promise<boolean> {
    const i = await this.getById(ctx, id);
    if (!i) return false;
    this.store = this.store.filter((x) => x.id !== id);
    return true;
  }

  async ownsRef(ctx: TenantContext, kind: InterventionRefKind, id: number): Promise<boolean> {
    return this.ownedRefs.has(`${ctx.artisanId}:${kind}:${id}`);
  }

  async findTechnicienIdForUser(ctx: TenantContext): Promise<number | null> {
    return this.userTechnicien.get(`${ctx.artisanId}:${ctx.userId}`) ?? null;
  }

  async listByTechnicien(ctx: TenantContext, technicienId: number): Promise<Intervention[]> {
    return this.store.filter((i) => i.artisanId === ctx.artisanId && i.technicienId === technicienId);
  }

  async listJour(ctx: TenantContext, dayStart: Date, dayEnd: Date): Promise<Intervention[]> {
    return this.store.filter(
      (i) => i.artisanId === ctx.artisanId && i.statut !== "annulee" && i.dateDebut >= dayStart && i.dateDebut <= dayEnd,
    );
  }

  private nom(technicienId: number): { nom: string | null; prenom: string | null } {
    return this.technicienNoms.get(String(technicienId)) ?? { nom: null, prenom: null };
  }

  async listEquipe(ctx: TenantContext, interventionId: number): Promise<EquipeMembre[]> {
    return this.equipe
      .filter((m) => m.artisanId === ctx.artisanId && m.interventionId === interventionId)
      .sort((a, b) => a.id - b.id)
      .map((m) => ({ id: m.id, technicienId: m.technicienId, role: m.role, ...this.nom(m.technicienId) }));
  }

  async listEquipesArtisan(ctx: TenantContext): Promise<EquipeMembreArtisan[]> {
    return this.equipe
      .filter((m) => m.artisanId === ctx.artisanId)
      .sort((a, b) => a.id - b.id)
      .map((m) => ({ id: m.id, interventionId: m.interventionId, technicienId: m.technicienId, role: m.role, ...this.nom(m.technicienId) }));
  }

  async addMembreEquipe(ctx: TenantContext, input: AjouterMembreEquipeInput): Promise<EquipeMembre> {
    const existing = this.equipe.find(
      (m) => m.artisanId === ctx.artisanId && m.interventionId === input.interventionId && m.technicienId === input.technicienId,
    );
    const m = existing ?? (() => {
      const created = {
        id: ++this.equipeSeq,
        artisanId: ctx.artisanId,
        interventionId: input.interventionId,
        technicienId: input.technicienId,
        role: input.role ?? null,
      };
      this.equipe.push(created);
      return created;
    })();
    return { id: m.id, technicienId: m.technicienId, role: m.role, ...this.nom(m.technicienId) };
  }

  async removeMembreEquipe(ctx: TenantContext, id: number): Promise<void> {
    this.equipe = this.equipe.filter((m) => !(m.id === id && m.artisanId === ctx.artisanId));
  }

  private couleurs: Array<{ artisanId: number; interventionId: number; couleur: string }> = [];

  async listCouleurs(ctx: TenantContext): Promise<Array<{ interventionId: number; couleur: string }>> {
    return this.couleurs
      .filter((c) => c.artisanId === ctx.artisanId)
      .map((c) => ({ interventionId: c.interventionId, couleur: c.couleur }));
  }

  async setCouleur(ctx: TenantContext, interventionId: number, couleur: string): Promise<void> {
    const existing = this.couleurs.find((c) => c.artisanId === ctx.artisanId && c.interventionId === interventionId);
    if (existing) existing.couleur = couleur;
    else this.couleurs.push({ artisanId: ctx.artisanId, interventionId, couleur });
  }
}
