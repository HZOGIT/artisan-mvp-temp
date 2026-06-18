import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { AppContext } from "./context";
import type { TenantContext } from "../../shared/tenant";
import { NotFoundError, ForbiddenError, ValidationError, ConflictError, TooManyRequestsError, UnauthorizedError } from "../../shared/errors";

// ⚠️ Le client (client/src) et le legacy utilisent **superjson** comme data transformer. Le
// new-stack DOIT l'utiliser aussi, sinon les payloads de mutation arrivent enveloppés (`{json:…}`)
// et la validation échoue (`nom` undefined…), et les réponses ne sont pas désérialisables côté front.
const t = initTRPC.context<AppContext>().create({ transformer: superjson });

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
  if (cause instanceof UnauthorizedError) throw new TRPCError({ code: "UNAUTHORIZED", message: cause.message });
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

// Exige un utilisateur authentifié avec le rôle `admin` (staff Operioz). ⚠️ INDÉPENDANT du tenant :
// un admin n'a pas forcément d'artisan → on s'appuie sur `ctx.role` (résolu depuis `users`), pas sur
// `ctx.tenant`. Sert aux surfaces globales (catalogue bibliothèque, modération, config globale…).
const requireAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.claims) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentification requise" });
  }
  if (ctx.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Réservé aux administrateurs" });
  }
  return next();
});

// Procédure PUBLIQUE (surface portail/vitrine par token — pas de tenant) : mapping des erreurs de
// domaine (NotFound→404, Validation→400…) mais SANS exigence de tenant. Le scoping est porté par la
// capacité (token) côté use-case/RLS, jamais par un cookie tenant.
export const publicProcedure = t.procedure.use(mapDomainErrors);

// Procédure protégée : mapping erreurs domaine + exigence de tenant.
export const protectedProcedure = t.procedure.use(mapDomainErrors).use(requireTenant);

// Procédure ADMIN (staff Operioz) : mapping erreurs domaine + exigence du rôle admin (sans tenant).
export const adminProcedure = t.procedure.use(mapDomainErrors).use(requireAdmin);

// Fabrique de middleware d'autorisation PAR PERMISSION (parité legacy `requirePermission`) : le rôle
// `admin` court-circuite tout ; sinon l'utilisateur doit posséder TOUTES les permissions requises
// (codes `domaine.action`, résolus dans `ctx.permissions`), sinon FORBIDDEN. À composer APRÈS
// `requireTenant` (les domaines consommateurs scopent par tenant).
function requirePermission(...requiredPerms: string[]) {
  return t.middleware(({ ctx, next }) => {
    if (!ctx.claims) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentification requise" });
    }
    if (ctx.role === "admin") return next(); // admin bypasse toutes les permissions
    const has = requiredPerms.every((p) => ctx.permissions.includes(p));
    if (!has) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Vous n'avez pas la permission requise" });
    }
    return next();
  });
}

// Procédure protégée GATÉE PAR PERMISSION(S) : erreurs domaine + tenant requis + permission(s)
// requise(s). Sert aux surfaces sensibles (gestion utilisateurs `utilisateurs.gerer`, comptabilité
// `comptabilite.voir`, exports `exports.voir`…).
export function permissionProcedure(...perms: string[]) {
  return t.procedure.use(mapDomainErrors).use(requireTenant).use(requirePermission(...perms));
}
