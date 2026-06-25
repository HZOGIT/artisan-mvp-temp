import { eq } from "drizzle-orm";
import { artisans, users } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../db";
import type { TenantContext, TokenClaims, TenantResolver } from "./tenant-context";

/*
 * Adapter (infra) du port TenantResolver : résout le TenantContext depuis les claims du
 * token (userId) en lisant `artisans`/`users`. Ces tables sont HORS RLS tenant (auth/
 * identité) → lisibles sans contexte tenant.
 *
 * Appartenance d'un utilisateur à un tenant (parité du domaine `utilisateurs`) :
 *   tenant = OWNER (`artisans.userId = userId`) ∪ COLLABORATEUR (`users.artisanId = userId`).
 * L'OWNER prime ; à défaut, un collaborateur/secrétaire/technicien invité est résolu via
 * `users.artisanId` (posé par l'owner à l'invitation → isolation cross-tenant garantie).
 * Renvoie null si l'utilisateur n'est rattaché à AUCUN tenant (accès protégé refusé → 401).
 */
export class DrizzleTenantResolver implements TenantResolver {
  constructor(private readonly db: DbClient) {}

  async resolve(claims: TokenClaims): Promise<TenantContext | null> {
    const [artisan] = await this.db
      .select({ id: artisans.id, franchiseTVA: artisans.franchiseTVA })
      .from(artisans)
      .where(eq(artisans.userId, claims.userId))
      .limit(1);

    const [user] = await this.db
      .select({ role: users.role, artisanId: users.artisanId })
      .from(users)
      .where(eq(users.id, claims.userId))
      .limit(1);

    /** OWNER prioritaire ; sinon rattachement collaborateur via users.artisanId. */
    const artisanId = artisan?.id ?? user?.artisanId ?? null;
    if (artisanId == null) return null;

    return {
      artisanId,
      userId: claims.userId,
      role: user?.role ?? undefined,
      isOwner: artisan !== undefined,
      franchiseTVA: artisan?.franchiseTVA ?? false,
    };
  }
}
