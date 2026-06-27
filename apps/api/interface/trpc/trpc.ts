import { initTRPC, TRPCError } from "@trpc/server";
import { ZodError } from "zod";
import superjson from "superjson";
import { Counter } from "prom-client";
import { trace } from "@opentelemetry/api";
import type { AppContext } from "./context";
import type { TenantContext } from "../../shared/tenant";
import { NotFoundError, ForbiddenError, ValidationError, ConflictError, TooManyRequestsError, UnauthorizedError } from "../../shared/errors";

const authFailuresTotal = new Counter({
  name: "auth_failures_total",
  help: "Échecs d'authentification par raison",
  labelNames: ["reason"],
});

const rateLimitHitsTotal = new Counter({
  name: "rate_limit_hits_total",
  help: "Requêtes bloquées par rate limiting",
  labelNames: ["endpoint"],
});

/*
 * ⚠️ Le client (client/src) et le legacy utilisent **superjson** comme data transformer. Le
 * new-stack DOIT l'utiliser aussi, sinon les payloads de mutation arrivent enveloppés (`{json:…}`)
 * et la validation échoue (`nom` undefined…), et les réponses ne sont pas désérialisables côté front.
 */
const t = initTRPC.context<AppContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: { ...shape.data, zodError: error.cause instanceof ZodError ? error.cause.flatten() : null },
    };
  },
});

export const router = t.router;

/*
 * Traduit les erreurs de domaine en codes tRPC (transport). En tRPC v11, `next()` ne
 * throw pas : il renvoie un résultat `{ ok:false, error }` où `error` est un TRPCError
 * dont la `cause` porte l'erreur d'origine levée par le use-case. On mappe selon la cause ;
 * les erreurs déjà formées (UNAUTHORIZED, BAD_REQUEST Zod…) passent inchangées.
 */
const mapDomainErrors = t.middleware(async ({ next, ctx, path }) => {
  const result = await next();
  if (result.ok) return result;
  const cause: unknown = result.error.cause ?? result.error;
  if (cause instanceof NotFoundError) throw new TRPCError({ code: "NOT_FOUND", message: cause.message });
  if (cause instanceof UnauthorizedError) {
    authFailuresTotal.inc({ reason: "invalid_credentials" });
    throw new TRPCError({ code: "UNAUTHORIZED", message: cause.message });
  }
  if (cause instanceof ValidationError) throw new TRPCError({ code: "BAD_REQUEST", message: cause.message });
  if (cause instanceof ForbiddenError) {
    /** Accès interdit depuis le domaine (ex. anti-self-approbation NDF, tentative IDOR) — signal sécurité. */
    ctx.log.warn({ event: "trpc_forbidden", reason: cause.message }, "Accès interdit — domaine");
    throw new TRPCError({ code: "FORBIDDEN", message: cause.message });
  }
  if (cause instanceof ConflictError) {
    /** Conflit d'état machine (ex. note déjà approuvée, contrat non-soumis) — signal UX / concurrence. */
    ctx.log.info({ event: "trpc_conflict", reason: cause.message }, "Conflit de domaine");
    throw new TRPCError({ code: "CONFLICT", message: cause.message });
  }
  if (cause instanceof TooManyRequestsError) {
    rateLimitHitsTotal.inc({ endpoint: path });
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: cause.message });
  }
  /** TRPCError déjà formé (requireTenant, requireAdmin, requirePermission…) — on laisse passer sans logger. */
  if (cause instanceof TRPCError) return result;
  const err = cause instanceof Error ? cause : new Error(String(cause));
  ctx.log.error({ event: "trpc_unhandled_error", err }, "Erreur tRPC non mappée");
  return result;
});

/**
 * Bind le nom de la procédure dans le child logger avant d'appeler next(), puis mesure le temps
 * d'exécution. Chaque log émis dans la procédure (ex. note_frais_approuvee) portera automatiquement
 * { procedure } comme champ indexé dans BetterStack — filtrable sans chercher dans le message.
 */
const logProcedureTiming = t.middleware(async ({ next, path, ctx }) => {
  trace.getActiveSpan()?.setAttributes({
    "trpc.procedure": path,
    ...(ctx.tenant?.artisanId ? { "tenant.id": ctx.tenant.artisanId } : {}),
  });
  const log = ctx.log?.child({ procedure: path }) ?? ctx.log;
  const t0 = Date.now();
  const result = await next({ ctx: { ...ctx, log } });
  const duration = Date.now() - t0;
  if (duration > 500) {
    log?.warn({ event: "trpc_slow_procedure", duration }, `Procédure lente: ${path} (${duration}ms)`);
  }
  return result;
});

/** Exige un TenantContext résolu (sinon UNAUTHORIZED) + narrowe `tenant` non-null. */
const requireTenant = t.middleware(({ ctx, next }) => {
  if (!ctx.tenant) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentification requise" });
  }
  const tenant: TenantContext = ctx.tenant;
  return next({ ctx: { ...ctx, tenant } });
});

const requireAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.claims) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentification requise" });
  }
  if (ctx.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Réservé aux administrateurs" });
  }
  return next();
});

/*
 * Staff Operioz uniquement : admin SANS tenant résolu. Un admin d'un artisan (tenant résolu) est
 * explicitement rejeté — il ne doit pas accéder aux surfaces plateforme (platformAdmin.*).
 * Composé APRÈS requireAdmin pour ne pas dupliquer le check rôle.
 */
const requirePlatformStaff = t.middleware(({ ctx, next }) => {
  if (ctx.tenant != null) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Accès réservé au staff plateforme (non-tenant)" });
  }
  return next();
});

/*
 * Procédure PUBLIQUE (surface portail/vitrine par token — pas de tenant) : mapping des erreurs de
 * domaine (NotFound→404, Validation→400…) mais SANS exigence de tenant. Le scoping est porté par la
 * capacité (token) côté use-case/RLS, jamais par un cookie tenant.
 */
export const publicProcedure = t.procedure.use(logProcedureTiming).use(mapDomainErrors);

/** Procédure protégée : mapping erreurs domaine + exigence de tenant. */
export const protectedProcedure = t.procedure.use(logProcedureTiming).use(mapDomainErrors).use(requireTenant);

/** Procédure ADMIN : mapping erreurs domaine + exigence du rôle admin (peut avoir un tenant). */
export const adminProcedure = t.procedure.use(logProcedureTiming).use(mapDomainErrors).use(requireAdmin);

/** Procédure PLATFORM ADMIN — staff Operioz uniquement (admin + sans tenant résolu). */
export const platformAdminProcedure = t.procedure.use(logProcedureTiming).use(mapDomainErrors).use(requireAdmin).use(requirePlatformStaff);

/*
 * Fabrique de middleware d'autorisation PAR PERMISSION (parité legacy `requirePermission`) : le rôle
 * `admin` court-circuite tout ; sinon l'utilisateur doit posséder TOUTES les permissions requises
 * (codes `domaine.action`, résolus dans `ctx.permissions`), sinon FORBIDDEN. À composer APRÈS
 * `requireTenant` (les domaines consommateurs scopent par tenant).
 */
function requirePermission(...requiredPerms: string[]) {
  return t.middleware(({ ctx, next }) => {
    if (!ctx.claims) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentification requise" });
    }
    /** admin bypasse toutes les permissions */
    if (ctx.role === "admin") return next();
    /** propriétaire du compte artisan bypasse les gates de permission */
    if (ctx.tenant?.isOwner) return next();
    const has = requiredPerms.every((p) => ctx.permissions.includes(p));
    if (!has) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Vous n'avez pas la permission requise" });
    }
    return next();
  });
}

/*
 * Procédure protégée GATÉE PAR PERMISSION(S) : erreurs domaine + tenant requis + permission(s)
 * requise(s). Sert aux surfaces sensibles (gestion utilisateurs `utilisateurs.gerer`, comptabilité
 * `comptabilite.voir`, exports `exports.voir`…).
 */
export function permissionProcedure(...perms: string[]) {
  return t.procedure.use(logProcedureTiming).use(mapDomainErrors).use(requireTenant).use(requirePermission(...perms));
}
