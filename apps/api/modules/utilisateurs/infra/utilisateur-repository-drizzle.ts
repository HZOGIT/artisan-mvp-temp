import { and, eq, or } from "drizzle-orm";
import { artisans, permissionsUtilisateur, users } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IUtilisateurRepository } from "../application/utilisateur-repository";
import type { CollaborateurRole, UtilisateurListItem } from "../domain/utilisateur";

/*
 * ⚠️ `users` et `permissions_utilisateur` sont HORS RLS (denylist) → AUCUN `withTenant` ne les protège ;
 * l'isolation est portée par un filtre EXPLICITE `artisanId` (et l'appartenance via `artisans.userId`
 * pour l'owner). Toute requête d'écriture vérifie l'appartenance AVANT d'agir (anti-IDOR cross-tenant).
 */
export class UtilisateurRepositoryDrizzle implements IUtilisateurRepository {
  constructor(private readonly db: DbClient) {}

  private async ownerUserId(ctx: TenantContext): Promise<number | null> {
    const [a] = await this.db.select({ userId: artisans.userId }).from(artisans).where(eq(artisans.id, ctx.artisanId)).limit(1);
    return a?.userId ?? null;
  }

  getOwnerUserId(ctx: TenantContext): Promise<number | null> {
    return this.ownerUserId(ctx);
  }

  async list(ctx: TenantContext): Promise<UtilisateurListItem[]> {
    const owner = await this.ownerUserId(ctx);
    const cond = owner != null ? or(eq(users.id, owner), eq(users.artisanId, ctx.artisanId)) : eq(users.artisanId, ctx.artisanId);
    const rows = await this.db
      .select({ id: users.id, name: users.name, prenom: users.prenom, email: users.email, role: users.role, actif: users.actif, lastSignedIn: users.lastSignedIn, createdAt: users.createdAt })
      .from(users)
      .where(cond);
    return rows.map((u) => ({ id: u.id, name: u.name ?? null, prenom: u.prenom ?? null, email: u.email ?? null, role: u.role, actif: u.actif, lastSignedIn: u.lastSignedIn ?? null, createdAt: u.createdAt }));
  }

  async emailExists(email: string): Promise<boolean> {
    const [u] = await this.db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    return Boolean(u);
  }

  async createCollaborateur(ctx: TenantContext, data: { email: string; name: string; prenom?: string; role: CollaborateurRole; passwordHash: string }): Promise<{ id: number; email: string | null; role: string }> {
    const [row] = await this.db
      .insert(users)
      .values({ email: data.email, name: data.name, prenom: data.prenom ?? null, role: data.role, artisanId: ctx.artisanId, password: data.passwordHash, loginMethod: "password", actif: true })
      .returning({ id: users.id, email: users.email, role: users.role });
    return { id: row.id, email: row.email ?? null, role: row.role };
  }

  // Appartenance STRICTE (collaborateur du tenant) : `users.artisanId === ctx.artisanId` (owner exclu).
  private async ownsStrict(ctx: TenantContext, userId: number): Promise<boolean> {
    const [u] = await this.db.select({ artisanId: users.artisanId }).from(users).where(eq(users.id, userId)).limit(1);
    return Boolean(u) && u.artisanId === ctx.artisanId;
  }

  async updateRole(ctx: TenantContext, userId: number, role: CollaborateurRole): Promise<{ id: number; role: string } | null> {
    if (!(await this.ownsStrict(ctx, userId))) return null;
    const [row] = await this.db.update(users).set({ role }).where(and(eq(users.id, userId), eq(users.artisanId, ctx.artisanId))).returning({ id: users.id, role: users.role });
    return row ? { id: row.id, role: row.role } : null;
  }

  async toggleActif(ctx: TenantContext, userId: number, actif: boolean): Promise<{ id: number; actif: boolean } | null> {
    if (!(await this.ownsStrict(ctx, userId))) return null;
    const [row] = await this.db.update(users).set({ actif }).where(and(eq(users.id, userId), eq(users.artisanId, ctx.artisanId))).returning({ id: users.id, actif: users.actif });
    return row ? { id: row.id, actif: row.actif } : null;
  }

  async getManageableUser(ctx: TenantContext, userId: number): Promise<{ id: number; role: string } | null> {
    const [u] = await this.db.select({ id: users.id, role: users.role, artisanId: users.artisanId }).from(users).where(eq(users.id, userId)).limit(1);
    if (!u) return null;
    const owner = await this.ownerUserId(ctx);
    const manageable = u.artisanId === ctx.artisanId || u.id === owner;
    return manageable ? { id: u.id, role: u.role } : null;
  }

  async getPermissions(userId: number): Promise<string[]> {
    const rows = await this.db
      .select({ permission: permissionsUtilisateur.permission })
      .from(permissionsUtilisateur)
      .where(and(eq(permissionsUtilisateur.userId, userId), eq(permissionsUtilisateur.autorise, true)));
    return rows.map((r) => r.permission);
  }

  async setPermissions(ctx: TenantContext, userId: number, permissions: string[]): Promise<boolean> {
    if (!(await this.ownsStrict(ctx, userId))) return false;
    await this.db.delete(permissionsUtilisateur).where(eq(permissionsUtilisateur.userId, userId));
    if (permissions.length > 0) {
      await this.db.insert(permissionsUtilisateur).values(permissions.map((p) => ({ userId, permission: p, autorise: true })));
    }
    return true;
  }

  async getNomEntreprise(ctx: TenantContext): Promise<string | null> {
    const [a] = await this.db.select({ nom: artisans.nomEntreprise }).from(artisans).where(eq(artisans.id, ctx.artisanId)).limit(1);
    return a?.nom ?? null;
  }
}
