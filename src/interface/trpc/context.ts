import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyAuthToken, type TokenClaims, type TenantContext, type TenantResolver } from "../../shared/tenant";

// Contexte tRPC du nouveau stack. Construit à partir de la requête Fastify :
// - extrait le cookie `token`, le vérifie (claims) ;
// - résout le TenantContext via un TenantResolver injecté (adapter DB branché plus tard).
// Tant qu'aucun resolver n'est fourni, `tenant` reste null (les procédures protégées
// refuseront l'accès) — le scaffold reste néanmoins bootable et testable.
export interface AppContext {
  readonly claims: TokenClaims | null;
  readonly tenant: TenantContext | null;
}

export interface ContextDeps {
  readonly jwtSecret?: string;
  readonly resolver?: TenantResolver;
}

export function makeCreateContext(deps: ContextDeps = {}) {
  const secret = deps.jwtSecret ?? process.env.JWT_SECRET ?? "";
  return async function createContext(opts: { req: FastifyRequest; res: FastifyReply }): Promise<AppContext> {
    const token = (opts.req.cookies as Record<string, string | undefined> | undefined)?.token ?? null;
    const claims = await verifyAuthToken(token, secret);
    const tenant = claims && deps.resolver ? await deps.resolver.resolve(claims) : null;
    return { claims, tenant };
  };
}
