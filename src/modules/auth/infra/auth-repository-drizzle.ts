import { and, eq, gte } from "drizzle-orm";
import { users } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import type { IAuthRepository } from "../application/auth-repository";
import type { AuthCredentials, AuthUser } from "../domain/auth";

// Repo auth Drizzle. `users` est HORS RLS (auth précède la résolution du tenant) → accès direct par
// id/email. Aucune écriture tenant ; seul `lastSignedIn` est mis à jour au login.
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
}
