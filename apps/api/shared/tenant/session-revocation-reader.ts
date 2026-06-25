import { eq } from "drizzle-orm";
import { users } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../db";
import type { SessionRevocationReader } from "./tenant-context";

/*
 * Lit `passwordChangedAt` (table `users`, HORS RLS) pour vérifier si un JWT est révoqué.
 * Un token émis avant `passwordChangedAt` est rejeté (reset / changement de mot de passe /
 * déconnexion forcée). Renvoie null si la colonne est vide → pas de révocation (comportement antérieur).
 */
export class DrizzleSessionRevocationReader implements SessionRevocationReader {
  constructor(private readonly db: DbClient) {}

  async getPasswordChangedAt(userId: number): Promise<Date | null> {
    const [u] = await this.db
      .select({ passwordChangedAt: users.passwordChangedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return u?.passwordChangedAt ?? null;
  }
}
