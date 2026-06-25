import type { TenantContext } from "../../../shared/tenant";
import type { ITechnicienRepository } from "../application/technicien-repository";
import type { Technicien, CreateTechnicienInput, UpdateTechnicienInput } from "../domain/technicien";
import type { Disponibilite, SetDisponibiliteInput } from "../domain/disponibilite";
import type { Position, EnregistrerPositionInput } from "../domain/position";
import type { UtilisateurLiable } from "../domain/utilisateur-liable";
import type { HabilitationTechnicien, AjouterHabilitationInput } from "../domain/habilitation";
import type { TechnicienStats } from "../domain/stats";

type InterventionStatut = "planifiee" | "en_cours" | "terminee" | "annulee";
type StoredPosition = Position & { expiresAt: Date };

const GPS_RETENTION_MS = 8 * 60 * 60 * 1000;

/*
 * Double in-memory du repository pour les tests de use-cases (sans DB). Reproduit le
 * scoping tenant : artisanId forcé du contexte, ressource hors tenant invisible.
 */
export class FakeTechnicienRepository implements ITechnicienRepository {
  private store: Technicien[] = [];
  private dispos: Disponibilite[] = [];
  private positions: StoredPosition[] = [];
  private habilitations: Array<HabilitationTechnicien & { artisanId: number }> = [];
  /** Interventions simulées pour les stats : {artisanId, technicienId, statut}. */
  private interventions: Array<{ artisanId: number; technicienId: number; statut: InterventionStatut }> = [];
  private usersLiables = new Map<number, UtilisateurLiable[]>();
  private seq = 0;
  private dispoSeq = 0;
  private posSeq = 0;
  private habSeq = 0;

  /** Utilitaire de test (hors port) : déclare une intervention (pour statsTechnicien). */
  seedIntervention(artisanId: number, technicienId: number, statut: InterventionStatut): void {
    this.interventions.push({ artisanId, technicienId, statut });
  }

  /** Utilitaire de test (hors port) : déclare les users liables d'un tenant. */
  seedUsersLiables(artisanId: number, list: UtilisateurLiable[]): void {
    this.usersLiables.set(artisanId, list);
  }

  private async owns(ctx: TenantContext, technicienId: number): Promise<boolean> {
    return (await this.getById(ctx, technicienId)) !== null;
  }

  async list(ctx: TenantContext): Promise<Technicien[]> {
    return this.store.filter((t) => t.artisanId === ctx.artisanId);
  }

  async getById(ctx: TenantContext, id: number): Promise<Technicien | null> {
    return this.store.find((t) => t.id === id && t.artisanId === ctx.artisanId) ?? null;
  }

  async create(ctx: TenantContext, input: CreateTechnicienInput): Promise<Technicien> {
    const now = new Date();
    const t: Technicien = {
      id: ++this.seq,
      artisanId: ctx.artisanId,
      nom: input.nom,
      prenom: input.prenom ?? null,
      email: input.email ?? null,
      telephone: input.telephone ?? null,
      specialite: input.specialite ?? null,
      couleur: input.couleur ?? null,
      statut: input.statut ?? "actif",
      coutHoraire: input.coutHoraire ?? null,
      userId: input.userId ?? null,
      notes: input.notes ?? null,
      suiviActif: true,
      createdAt: now,
      updatedAt: now,
    };
    this.store.push(t);
    return t;
  }

  async update(ctx: TenantContext, id: number, input: UpdateTechnicienInput): Promise<Technicien | null> {
    const t = await this.getById(ctx, id);
    if (!t) return null;
    const updated: Technicien = { ...t, ...input, updatedAt: new Date() };
    this.store = this.store.map((x) => (x.id === id ? updated : x));
    return updated;
  }

  async delete(ctx: TenantContext, id: number): Promise<boolean> {
    const t = await this.getById(ctx, id);
    if (!t) return false;
    this.store = this.store.filter((x) => x.id !== id);
    this.dispos = this.dispos.filter((d) => d.technicienId !== id);
    return true;
  }

  async listDisponibilites(ctx: TenantContext, technicienId: number): Promise<Disponibilite[]> {
    if (!(await this.owns(ctx, technicienId))) return [];
    return this.dispos
      .filter((d) => d.technicienId === technicienId)
      .sort((a, b) => a.jourSemaine - b.jourSemaine);
  }

  async setDisponibilite(
    ctx: TenantContext,
    technicienId: number,
    input: SetDisponibiliteInput,
  ): Promise<Disponibilite | null> {
    if (!(await this.owns(ctx, technicienId))) return null;
    const existing = this.dispos.find((d) => d.technicienId === technicienId && d.jourSemaine === input.jourSemaine);
    if (existing) {
      const updated: Disponibilite = { ...existing, ...input };
      this.dispos = this.dispos.map((d) => (d.id === existing.id ? updated : d));
      return updated;
    }
    const d: Disponibilite = { id: ++this.dispoSeq, technicienId, ...input };
    this.dispos.push(d);
    return d;
  }

  async getDernierePosition(ctx: TenantContext, technicienId: number): Promise<Position | null> {
    if (!(await this.owns(ctx, technicienId))) return null;
    const list = this.positions
      .filter((p) => p.technicienId === technicienId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime() || b.id - a.id);
    const found = list[0];
    if (!found) return null;
    const { expiresAt: _e, ...pos } = found;
    return pos;
  }

  async enregistrerPosition(
    ctx: TenantContext,
    technicienId: number,
    input: EnregistrerPositionInput,
  ): Promise<Position | null> {
    if (!(await this.owns(ctx, technicienId))) return null;
    const now = new Date();
    const stored: StoredPosition = {
      id: ++this.posSeq,
      technicienId,
      latitude: input.latitude,
      longitude: input.longitude,
      precision: input.precision ?? null,
      vitesse: input.vitesse ?? null,
      cap: input.cap ?? null,
      batterie: input.batterie ?? null,
      enDeplacement: input.enDeplacement ?? false,
      interventionEnCoursId: input.interventionEnCoursId ?? null,
      timestamp: now,
      expiresAt: new Date(now.getTime() + GPS_RETENTION_MS),
    };
    this.positions.push(stored);
    const { expiresAt: _e, ...pos } = stored;
    return pos;
  }

  async setSuiviActif(ctx: TenantContext, technicienId: number, actif: boolean): Promise<Technicien | null> {
    const t = await this.getById(ctx, technicienId);
    if (!t) return null;
    const updated: Technicien = { ...t, suiviActif: actif, updatedAt: new Date() };
    this.store = this.store.map((x) => (x.id === technicienId ? updated : x));
    return updated;
  }

  async purgerPositionsExpirees(): Promise<number> {
    const now = new Date();
    const before = this.positions.length;
    this.positions = this.positions.filter((p) => p.expiresAt >= now);
    return before - this.positions.length;
  }

  async setSuiviActif(ctx: TenantContext, technicienId: number, actif: boolean): Promise<Technicien | null> {
    const t = await this.getById(ctx, technicienId);
    if (!t) return null;
    const updated: Technicien = { ...t, suiviActif: actif, updatedAt: new Date() };
    this.store = this.store.map((x) => (x.id === technicienId ? updated : x));
    return updated;
  }

  async purgerPositionsExpirees(): Promise<number> {
    const cutoff = new Date(Date.now() - 8 * 60 * 60 * 1000);
    const before = this.positions.length;
    this.positions = this.positions.filter((p) => p.timestamp >= cutoff);
    return before - this.positions.length;
  }

  async getUsersLiables(ctx: TenantContext): Promise<UtilisateurLiable[]> {
    return this.usersLiables.get(ctx.artisanId) ?? [];
  }

  async listHabilitations(ctx: TenantContext, technicienId: number): Promise<HabilitationTechnicien[]> {
    if (!(await this.owns(ctx, technicienId))) return [];
    return this.habilitations
      .filter((h) => h.artisanId === ctx.artisanId && h.technicienId === technicienId)
      .map(({ artisanId: _a, ...h }) => h);
  }

  async ajouterHabilitation(
    ctx: TenantContext,
    technicienId: number,
    input: AjouterHabilitationInput,
  ): Promise<HabilitationTechnicien | null> {
    if (!(await this.owns(ctx, technicienId))) return null;
    const h: HabilitationTechnicien & { artisanId: number } = {
      id: ++this.habSeq,
      artisanId: ctx.artisanId,
      technicienId,
      type: input.type,
      numero: input.numero ?? null,
      organisme: input.organisme ?? null,
      dateObtention: input.dateObtention ?? null,
      dateExpiration: input.dateExpiration ?? null,
      createdAt: new Date(),
    };
    this.habilitations.push(h);
    const { artisanId: _a, ...pub } = h;
    return pub;
  }

  async supprimerHabilitation(ctx: TenantContext, technicienId: number, id: number): Promise<boolean> {
    if (!(await this.owns(ctx, technicienId))) return false;
    const before = this.habilitations.length;
    this.habilitations = this.habilitations.filter((h) => !(h.id === id && h.technicienId === technicienId));
    return this.habilitations.length < before;
  }

  async statsTechnicien(ctx: TenantContext, technicienId: number): Promise<TechnicienStats | null> {
    if (!(await this.owns(ctx, technicienId))) return null;
    const mine = this.interventions.filter((i) => i.artisanId === ctx.artisanId && i.technicienId === technicienId);
    return {
      total: mine.length,
      terminees: mine.filter((i) => i.statut === "terminee").length,
      enCours: mine.filter((i) => i.statut === "en_cours").length,
      planifiees: mine.filter((i) => i.statut === "planifiee").length,
    };
  }
}
