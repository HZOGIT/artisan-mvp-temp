import { eq } from "drizzle-orm";
import { artisans, users } from "../../../drizzle/schema.pg";
import type { DbClient } from "../db";
import type { TenantContext, TokenClaims, TenantResolver } from "./tenant-context";

// Adapter (infra) du port TenantResolver : résout le TenantContext depuis les claims du
// token (userId) en lisant `artisans`/`users`. Ces tables sont HORS RLS tenant (auth/
// identité) → lisibles sans contexte tenant. Renvoie null si l'utilisateur n'a pas
// d'artisan associé (pas de tenant → accès protégé refusé).
export class DrizzleTenantResolver implements TenantResolver {
  constructor(private readonly db: DbClient) {}

  async resolve(claims: TokenClaims): Promise<TenantContext | null> {
    const [artisan] = await this.db
      .select({ id: artisans.id })
      .from(artisans)
      .where(eq(artisans.userId, claims.userId))
      .limit(1);
    if (!artisan) return null;

    const [user] = await this.db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, claims.userId))
      .limit(1);

    return {
      artisanId: artisan.id,
      userId: claims.userId,
      role: user?.role ?? undefined,
    };
  }
}
