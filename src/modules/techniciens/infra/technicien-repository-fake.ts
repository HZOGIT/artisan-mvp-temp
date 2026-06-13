import type { TenantContext } from "../../../shared/tenant";
import type { ITechnicienRepository } from "../application/technicien-repository";
import type { Technicien, CreateTechnicienInput, UpdateTechnicienInput } from "../domain/technicien";
import type { Disponibilite, SetDisponibiliteInput } from "../domain/disponibilite";
import type { Position, EnregistrerPositionInput } from "../domain/position";
import type { UtilisateurLiable } from "../domain/utilisateur-liable";

// Double in-memory du repository pour les tests de use-cases (sans DB). Reproduit le
// scoping tenant : artisanId forcé du contexte, ressource hors tenant invisible.
export class FakeTechnicienRepository implements ITechnicienRepository {
  private store: Technicien[] = [];
  private dispos: Disponibilite[] = [];
  private positions: Position[] = [];
  private usersLiables = new Map<number, UtilisateurLiable[]>();
  private seq = 0;
  private dispoSeq = 0;
  private posSeq = 0;

  // Utilitaire de test (hors port) : déclare les users liables d'un tenant.
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
    return list[0] ?? null;
  }

  async enregistrerPosition(
    ctx: TenantContext,
    technicienId: number,
    input: EnregistrerPositionInput,
  ): Promise<Position | null> {
    if (!(await this.owns(ctx, technicienId))) return null;
    const p: Position = {
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
      timestamp: new Date(),
    };
    this.positions.push(p);
    return p;
  }

  async getUsersLiables(ctx: TenantContext): Promise<UtilisateurLiable[]> {
    return this.usersLiables.get(ctx.artisanId) ?? [];
  }
}
