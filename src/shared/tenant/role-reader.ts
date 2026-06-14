import { eq } from "drizzle-orm";
import { users } from "../../../drizzle/schema.pg";
import type { DbClient } from "../db";

// Lecture du rôle d'un utilisateur (auth/identité — table `users`, HORS RLS tenant). Volontairement
// DÉCOUPLÉ du TenantResolver : le rôle doit être disponible **même sans artisan** (un admin staff
// Operioz n'a pas forcément de tenant). Le JWT ne porte que {userId,email} → le rôle vient de la DB.
export interface UserRoleReader {
  getRole(userId: number): Promise<string | null>;
}

export class DrizzleUserRoleReader implements UserRoleReader {
  constructor(private readonly db: DbClient) {}

  async getRole(userId: number): Promise<string | null> {
    const [u] = await this.db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    return u?.role ?? null;
  }
}
