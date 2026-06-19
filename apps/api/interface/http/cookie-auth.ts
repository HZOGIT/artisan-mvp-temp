import type { FastifyRequest } from "fastify";
import { verifyAuthToken, type TenantResolver } from "../../shared/tenant";

export interface CookieAuthDeps {
  readonly jwtSecret: string;
  readonly resolver: TenantResolver;
}

export type CookieAuthResult =
  | { readonly status: "ok"; readonly artisanId: number; readonly userId: number }
  | { readonly status: "unauthenticated" }
  | { readonly status: "no-artisan" };

/*
 * Authentifie une requête HORS-tRPC via le cookie `token` (même JWT que tRPC) puis résout le tenant.
 * → `unauthenticated` (401) si pas de cookie / JWT invalide ; `no-artisan` (404) si l'utilisateur n'a
 * pas d'artisan ; `ok` sinon (artisanId = capacité prouvée par la session).
 */
export async function authArtisanFromCookie(req: FastifyRequest, deps: CookieAuthDeps): Promise<CookieAuthResult> {
  const token = (req.cookies as Record<string, string | undefined> | undefined)?.token ?? null;
  const claims = await verifyAuthToken(token, deps.jwtSecret);
  if (!claims) return { status: "unauthenticated" };
  const tenant = await deps.resolver.resolve(claims);
  if (!tenant) return { status: "no-artisan" };
  return { status: "ok", artisanId: tenant.artisanId, userId: claims.userId };
}
