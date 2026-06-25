import { and, eq, gte } from "drizzle-orm";
import { artisans, billingEvents, billingSubscriptions, permissionsUtilisateur, users } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import type { IAuthRepository } from "../application/auth-repository";
import type { AuthCredentials, AuthUser } from "../domain/auth";
import { ALL_PERMISSIONS } from "../../../../../packages/contract/permissions";

/*
 * Repo auth Drizzle. `users` est HORS RLS (auth précède la résolution du tenant) → accès direct par
 * id/email. Aucune écriture tenant ; seul `lastSignedIn` est mis à jour au login.
 */
export class AuthRepositoryDrizzle implements IAuthRepository {
  constructor(private readonly db: DbClient) {}

  async findCredentials(email: string): Promise<AuthCredentials | null> {
    const [u] = await this.db.select({ id: users.id, email: users.email, password: users.password, actif: users.actif }).from(users).where(eq(users.email, email)).limit(1);
    return u ? { id: u.id, email: u.email ?? null, password: u.password ?? null, actif: u.actif } : null;
  }

  async getById(userId: number): Promise<AuthUser | null> {
    const [u] = await this.db
      .select({ id: users.id, email: users.email, name: users.name, prenom: users.prenom, role: users.role, artisanId: users.artisanId, actif: users.actif })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return u ? { id: u.id, email: u.email ?? null, name: u.name ?? null, prenom: u.prenom ?? null, role: u.role, artisanId: u.artisanId ?? null, actif: u.actif } : null;
  }

  async touchLastSignedIn(userId: number): Promise<void> {
    await this.db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, userId));
  }

  async findCredentialsById(userId: number): Promise<AuthCredentials | null> {
    const [u] = await this.db.select({ id: users.id, email: users.email, password: users.password, actif: users.actif }).from(users).where(eq(users.id, userId)).limit(1);
    return u ? { id: u.id, email: u.email ?? null, password: u.password ?? null, actif: u.actif } : null;
  }

  async findIdByEmail(email: string): Promise<number | null> {
    const [u] = await this.db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    return u?.id ?? null;
  }

  async updateEmail(userId: number, email: string): Promise<void> {
    await this.db.update(users).set({ email }).where(eq(users.id, userId));
  }

  async updatePassword(userId: number, passwordHash: string): Promise<void> {
    await this.db.update(users).set({ password: passwordHash }).where(eq(users.id, userId));
  }

  async setResetToken(userId: number, tokenHash: string, expiry: Date): Promise<void> {
    await this.db.update(users).set({ resetToken: tokenHash, resetTokenExpiry: expiry }).where(eq(users.id, userId));
  }

  async findByValidResetToken(tokenHash: string): Promise<{ id: number } | null> {
    const [u] = await this.db.select({ id: users.id }).from(users).where(and(eq(users.resetToken, tokenHash), gte(users.resetTokenExpiry, new Date()))).limit(1);
    return u ? { id: u.id } : null;
  }

  async resetPasswordWithToken(userId: number, passwordHash: string): Promise<void> {
    await this.db.update(users).set({ password: passwordHash, resetToken: null, resetTokenExpiry: null }).where(eq(users.id, userId));
  }

  async softDelete(userId: number, neutralizedEmail: string): Promise<void> {
    await this.db.update(users).set({ actif: false, email: neutralizedEmail }).where(eq(users.id, userId));
  }

  async getPasswordChangedAt(userId: number): Promise<Date | null> {
    const [u] = await this.db.select({ passwordChangedAt: users.passwordChangedAt }).from(users).where(eq(users.id, userId)).limit(1);
    return u?.passwordChangedAt ?? null;
  }

  async bumpPasswordChangedAt(userId: number): Promise<void> {
    await this.db.update(users).set({ passwordChangedAt: new Date() }).where(eq(users.id, userId));
  }

  async createUser(data: { email: string; passwordHash: string; name?: string | null }): Promise<{ id: number; email: string | null }> {
    const [row] = await this.db
      .insert(users)
      .values({ email: data.email, password: data.passwordHash, name: data.name ?? null, loginMethod: "email", lastSignedIn: new Date() })
      .returning({ id: users.id, email: users.email });
    return { id: row.id, email: row.email ?? null };
  }

  /*
   * Provisionne le compte propriétaire (idempotent). ⚠️ `artisans`/`subscriptions`/`permissions_utilisateur`
   * sont HORS RLS → accès direct scopé par les ids ; seul l'artisan est requis, le reste est best-effort.
   */
  async bootstrapAccount(userId: number): Promise<void> {
    /** 1. Artisan (idempotent via UNIQUE(userId)). */
    let [artisan] = await this.db.select({ id: artisans.id }).from(artisans).where(eq(artisans.userId, userId)).limit(1);
    if (!artisan) {
      [artisan] = await this.db.insert(artisans).values({ userId }).returning({ id: artisans.id });
    }
    const artisanId = artisan.id;
    /** 2. Lier le propriétaire à son entreprise (requis par subscription/permissions ; idempotent). */
    await this.db.update(users).set({ artisanId }).where(eq(users.id, userId));
    /** 3. Abonnement d'essai (billing maison, si absent) — best-effort. */
    try {
      const [existing] = await this.db.select({ id: billingSubscriptions.id }).from(billingSubscriptions).where(eq(billingSubscriptions.artisan_id, artisanId)).limit(1);
      if (!existing) {
        const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
        const [newSub] = await this.db
          .insert(billingSubscriptions)
          .values({ artisan_id: artisanId, plan_id: "starter", billing_mode: "maison", status: "trialing", trial_ends_at: trialEndsAt })
          .onConflictDoNothing({ target: billingSubscriptions.artisan_id })
          .returning({ id: billingSubscriptions.id });
        if (newSub) {
          await this.db.insert(billingEvents).values({
            entity_type: "billing_subscription",
            entity_id: newSub.id,
            event_type: "subscription.created",
            payload: { artisanId, planId: "starter", billingMode: "maison", status: "trialing", trialEndsAt: trialEndsAt.toISOString() },
            actor: "system:registration",
          });
        }
      }
    } catch {
      /* best-effort */
    }
    /** 4. Permissions propriétaire = TOUTES (si aucune présente) — best-effort. */
    try {
      const existing = await this.db.select({ id: permissionsUtilisateur.id }).from(permissionsUtilisateur).where(and(eq(permissionsUtilisateur.userId, userId), eq(permissionsUtilisateur.autorise, true))).limit(1);
      if (existing.length === 0) {
        await this.db.insert(permissionsUtilisateur).values(ALL_PERMISSIONS.map((p) => ({ userId, permission: p, autorise: true })));
      }
    } catch {
      /* best-effort */
    }
  }
}
