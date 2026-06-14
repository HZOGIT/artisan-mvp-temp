import { eq } from "drizzle-orm";
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
}
