import type { FastifyRequest, FastifyReply, FastifyBaseLogger } from "fastify";
import { verifyAuthToken, type TokenClaims, type TenantContext, type TenantResolver, type UserRoleReader, type PermissionsReader } from "../../shared/tenant";
import { extractClientIp, extractUserAgent } from "../http/client-ip";

/*
 * Contexte tRPC du nouveau stack. Construit à partir de la requête Fastify :
 * - extrait le cookie `token`, le vérifie (claims) ;
 * - résout le TenantContext via un TenantResolver injecté (adapter DB branché plus tard) ;
 * - résout le `role` de l'utilisateur (auth/identité) INDÉPENDAMMENT du tenant : un admin staff
 *   Operioz n'a pas forcément d'artisan → le rôle ne peut pas dépendre de la résolution tenant.
 * Tant qu'aucun resolver n'est fourni, `tenant` reste null (les procédures protégées refuseront
 * l'accès) — le scaffold reste néanmoins bootable et testable.
 */
export interface AppContext {
  readonly claims: TokenClaims | null;
  readonly tenant: TenantContext | null;
  readonly role: string | null;
  /*
   * Permissions de l'utilisateur courant (codes `domaine.action`), résolues depuis `permissions_utilisateur`.
   * Sert au seam `permissionProcedure`. Vide si non authentifié ou aucun reader injecté.
   */
  readonly permissions: readonly string[];
  /*
   * Réponse Fastify (pour poser/effacer le cookie d'auth depuis les procédures `auth.*`). Null hors
   * d'une requête HTTP réelle (tests via createCaller) → les procédures cookie doivent rester tolérantes.
   */
  readonly res: FastifyReply | null;
  /** Logger pino de la requête courante — disponible dans les middlewares tRPC et les handlers. */
  readonly log: FastifyBaseLogger;
  /*
   * IP cliente (valeur probante, cf-connecting-ip prioritaire, ≤45 car.) + User-Agent — pour la
   * capture lors de la signature/refus de devis. "unknown" si indéterminable.
   */
  readonly clientIp: string;
  readonly userAgent: string;
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
    if (token && !claims) {
      opts.req.log.warn({ event: "auth_invalid_token" }, "Token JWT invalide ou expiré");
    }
    const tenant = claims && deps.resolver ? await deps.resolver.resolve(claims) : null;
    /*
     * Rôle résolu via le roleReader (INDÉPENDANT du tenant) ; repli sur `tenant.role` (déjà résolu)
     * si aucun roleReader n'est injecté, afin de ne pas régresser le câblage/les tests existants.
     */
    const role = claims ? (deps.roleReader ? await deps.roleReader.getRole(claims.userId) : tenant?.role ?? null) : null;
    /** Permissions résolues comme le rôle (INDÉPENDANT du tenant) ; vide si pas de reader/auth. */
    const permissions = claims && deps.permissionsReader ? await deps.permissionsReader.getPermissions(claims.userId) : [];
    const headers = (opts.req.headers ?? {}) as Record<string, unknown>;
    const clientIp = extractClientIp(headers, opts.req.ip ?? null);
    const userAgent = extractUserAgent(headers);
    /** Bind userId + artisanId so every ctx.log call porte l'identité sans la passer manuellement. */
    const log = claims
      ? opts.req.log.child({ userId: claims.userId, ...(tenant ? { artisanId: tenant.artisanId } : {}) })
      : opts.req.log;
    return { claims, tenant, role, permissions, res: opts.res, log, clientIp, userAgent };
  };
}
