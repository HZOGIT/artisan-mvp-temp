import type { TenantContext } from "../../../shared/tenant";
import type { IUtilisateurRepository } from "../application/utilisateur-repository";
import type { CollaborateurRole, UtilisateurListItem } from "../domain/utilisateur";

interface FakeUser {
  id: number;
  name: string | null;
  prenom: string | null;
  email: string | null;
  role: string;
  actif: boolean;
  lastSignedIn: Date | null;
  createdAt: Date;
  artisanId: number | null;
}

/** Fake in-memory déterministe reproduisant l'isolation EXPLICITE par artisanId + la notion d'owner. */
export class FakeUtilisateurRepository implements IUtilisateurRepository {
  private seq = 0;
  private users: FakeUser[] = [];
  private readonly perms = new Map<number, string[]>();
  /** artisanId → ownerUserId */
  private readonly owners = new Map<number, number>();
  private readonly noms = new Map<number, string>();

  setOwner(artisanId: number, ownerUserId: number): void {
    this.owners.set(artisanId, ownerUserId);
  }
  setNomEntreprise(artisanId: number, nom: string): void {
    this.noms.set(artisanId, nom);
  }
  seedUser(u: Partial<FakeUser> & { id: number; role: string }): FakeUser {
    const full: FakeUser = { name: null, prenom: null, email: `u${u.id}@t.fr`, actif: true, lastSignedIn: null, createdAt: new Date(0), artisanId: null, ...u };
    if (u.id > this.seq) this.seq = u.id;
    this.users.push(full);
    return full;
  }
  seedPermissions(userId: number, perms: string[]): void {
    this.perms.set(userId, [...perms]);
  }

  private byId(id: number): FakeUser | undefined {
    return this.users.find((u) => u.id === id);
  }
  private ownsStrict(ctx: TenantContext, userId: number): boolean {
    const u = this.byId(userId);
    return Boolean(u) && u!.artisanId === ctx.artisanId;
  }

  async list(ctx: TenantContext): Promise<UtilisateurListItem[]> {
    const owner = this.owners.get(ctx.artisanId) ?? null;
    return this.users
      .filter((u) => u.artisanId === ctx.artisanId || u.id === owner)
      .map((u) => ({ id: u.id, name: u.name, prenom: u.prenom, email: u.email, role: u.role, actif: u.actif, lastSignedIn: u.lastSignedIn, createdAt: u.createdAt }));
  }

  async emailExists(email: string): Promise<boolean> {
    return this.users.some((u) => u.email === email);
  }

  async createCollaborateur(ctx: TenantContext, data: { email: string; name: string; prenom?: string; role: CollaborateurRole; passwordHash: string }): Promise<{ id: number; email: string | null; role: string }> {
    const u = this.seedUser({ id: ++this.seq, email: data.email, name: data.name, prenom: data.prenom ?? null, role: data.role, artisanId: ctx.artisanId });
    return { id: u.id, email: u.email, role: u.role };
  }

  async updateRole(ctx: TenantContext, userId: number, role: CollaborateurRole): Promise<{ id: number; role: string } | null> {
    if (!this.ownsStrict(ctx, userId)) return null;
    const u = this.byId(userId)!;
    u.role = role;
    return { id: u.id, role: u.role };
  }

  async toggleActif(ctx: TenantContext, userId: number, actif: boolean): Promise<{ id: number; actif: boolean } | null> {
    if (!this.ownsStrict(ctx, userId)) return null;
    const u = this.byId(userId)!;
    u.actif = actif;
    return { id: u.id, actif: u.actif };
  }

  async getManageableUser(ctx: TenantContext, userId: number): Promise<{ id: number; role: string } | null> {
    const u = this.byId(userId);
    if (!u) return null;
    const owner = this.owners.get(ctx.artisanId) ?? null;
    return u.artisanId === ctx.artisanId || u.id === owner ? { id: u.id, role: u.role } : null;
  }

  async getPermissions(userId: number): Promise<string[]> {
    return [...(this.perms.get(userId) ?? [])];
  }

  async setPermissions(ctx: TenantContext, userId: number, permissions: string[]): Promise<boolean> {
    if (!this.ownsStrict(ctx, userId)) return false;
    this.perms.set(userId, [...permissions]);
    return true;
  }

  async getNomEntreprise(ctx: TenantContext): Promise<string | null> {
    return this.noms.get(ctx.artisanId) ?? null;
  }

  async getOwnerUserId(ctx: TenantContext): Promise<number | null> {
    return this.owners.get(ctx.artisanId) ?? null;
  }
}
