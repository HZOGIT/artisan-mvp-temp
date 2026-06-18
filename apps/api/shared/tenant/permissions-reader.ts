import { and, eq } from "drizzle-orm";
import { permissionsUtilisateur } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../db";

// Lecture des permissions d'un utilisateur (table `permissions_utilisateur`, HORS RLS tenant — clé par
// `userId`). Sert au seam d'autorisation par permission (`permissionProcedure`) : parité legacy
// `getUserPermissions` (permissions où `autorise = true`). DÉCOUPLÉ du tenant (comme le rôle).
export interface PermissionsReader {
  getPermissions(userId: number): Promise<string[]>;
}

export class DrizzlePermissionsReader implements PermissionsReader {
  constructor(private readonly db: DbClient) {}

  async getPermissions(userId: number): Promise<string[]> {
    const rows = await this.db
      .select({ permission: permissionsUtilisateur.permission })
      .from(permissionsUtilisateur)
      .where(and(eq(permissionsUtilisateur.userId, userId), eq(permissionsUtilisateur.autorise, true)));
    return rows.map((r) => r.permission);
  }
}
