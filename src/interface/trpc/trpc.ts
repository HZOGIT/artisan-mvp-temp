import { initTRPC, TRPCError } from "@trpc/server";
import type { AppContext } from "./context";
import type { TenantContext } from "../../shared/tenant";
import { NotFoundError, ForbiddenError, ValidationError, ConflictError, TooManyRequestsError } from "../../shared/errors";

const t = initTRPC.context<AppContext>().create();

export const router = t.router;

// Traduit les erreurs de domaine en codes tRPC (transport). En tRPC v11, `next()` ne
// throw pas : il renvoie un résultat `{ ok:false, error }` où `error` est un TRPCError
// dont la `cause` porte l'erreur d'origine levée par le use-case. On mappe selon la cause ;
// les erreurs déjà formées (UNAUTHORIZED, BAD_REQUEST Zod…) passent inchangées.
const mapDomainErrors = t.middleware(async ({ next }) => {
  const result = await next();
  if (result.ok) return result;
  const cause: unknown = result.error.cause ?? result.error;
  if (cause instanceof NotFoundError) throw new TRPCError({ code: "NOT_FOUND", message: cause.message });
  if (cause instanceof ValidationError) throw new TRPCError({ code: "BAD_REQUEST", message: cause.message });
  if (cause instanceof ForbiddenError) throw new TRPCError({ code: "FORBIDDEN", message: cause.message });
  if (cause instanceof ConflictError) throw new TRPCError({ code: "CONFLICT", message: cause.message });
  if (cause instanceof TooManyRequestsError) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: cause.message });
  return result;
});

// Exige un TenantContext résolu (sinon UNAUTHORIZED) + narrowe `tenant` non-null.
const requireTenant = t.middleware(({ ctx, next }) => {
  if (!ctx.tenant) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentification requise" });
  }
  const tenant: TenantContext = ctx.tenant;
  return next({ ctx: { ...ctx, tenant } });
});

// Procédure PUBLIQUE (surface portail/vitrine par token — pas de tenant) : mapping des erreurs de
// domaine (NotFound→404, Validation→400…) mais SANS exigence de tenant. Le scoping est porté par la
// capacité (token) côté use-case/RLS, jamais par un cookie tenant.
export const publicProcedure = t.procedure.use(mapDomainErrors);

// Procédure protégée : mapping erreurs domaine + exigence de tenant.
export const protectedProcedure = t.procedure.use(mapDomainErrors).use(requireTenant);
