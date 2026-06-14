import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyAuthToken, type TokenClaims, type TenantContext, type TenantResolver, type UserRoleReader, type PermissionsReader } from "../../shared/tenant";

// Contexte tRPC du nouveau stack. Construit à partir de la requête Fastify :
// - extrait le cookie `token`, le vérifie (claims) ;
// - résout le TenantContext via un TenantResolver injecté (adapter DB branché plus tard) ;
// - résout le `role` de l'utilisateur (auth/identité) INDÉPENDAMMENT du tenant : un admin staff
//   Operioz n'a pas forcément d'artisan → le rôle ne peut pas dépendre de la résolution tenant.
// Tant qu'aucun resolver n'est fourni, `tenant` reste null (les procédures protégées refuseront
// l'accès) — le scaffold reste néanmoins bootable et testable.
export interface AppContext {
  readonly claims: TokenClaims | null;
  readonly tenant: TenantContext | null;
  readonly role: string | null;
  // Permissions de l'utilisateur courant (codes `domaine.action`), résolues depuis `permissions_utilisateur`.
  // Sert au seam `permissionProcedure`. Vide si non authentifié ou aucun reader injecté.
  readonly permissions: readonly string[];
}

export interface ContextDeps {
  readonly jwtSecret?: string;
  readonly resolver?: TenantResolver;
  readonly roleReader?: UserRoleReader;
  readonly permissionsReader?: PermissionsReader;
}

export function makeCreateContext(deps: ContextDeps = {}) {
  const secret = deps.jwtSecret ?? process.env.JWT_SECRET ?? "";
  return async function createContext(opts: { req: FastifyRequest; res: FastifyReply }): Promise<AppContext> {
    const token = (opts.req.cookies as Record<string, string | undefined> | undefined)?.token ?? null;
    const claims = await verifyAuthToken(token, secret);
    const tenant = claims && deps.resolver ? await deps.resolver.resolve(claims) : null;
    // Rôle résolu via le roleReader (INDÉPENDANT du tenant) ; repli sur `tenant.role` (déjà résolu)
    // si aucun roleReader n'est injecté, afin de ne pas régresser le câblage/les tests existants.
    const role = claims ? (deps.roleReader ? await deps.roleReader.getRole(claims.userId) : tenant?.role ?? null) : null;
    // Permissions résolues comme le rôle (INDÉPENDANT du tenant) ; vide si pas de reader/auth.
    const permissions = claims && deps.permissionsReader ? await deps.permissionsReader.getPermissions(claims.userId) : [];
    return { claims, tenant, role, permissions };
  };
}
