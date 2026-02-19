import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

// Role-based middleware factory
export function requireRole(...allowedRoles: string[]) {
  return t.middleware(async (opts) => {
    if (!opts.ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    if (!allowedRoles.includes(opts.ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Accès interdit pour votre rôle" });
    }
    return opts.next({ ctx: opts.ctx });
  });
}

// Admin only (gestion utilisateurs)
export const adminOnlyProcedure = t.procedure.use(requireRole("admin"));
// Admin + Artisan (parametres, comptabilite, exports)
export const adminArtisanProcedure = t.procedure.use(requireRole("admin", "artisan"));
// Everyone except technicien (devis, factures, clients, chat)
export const noTechProcedure = t.procedure.use(requireRole("admin", "artisan", "secretaire"));

// Permission-based middleware factory
export function requirePermission(...requiredPerms: string[]) {
  return t.middleware(async (opts) => {
    if (!opts.ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    // Admin bypasses all permission checks
    if (opts.ctx.user.role === "admin") {
      return opts.next({ ctx: opts.ctx });
    }
    const userPerms: string[] = (opts.ctx.user as any).permissions || [];
    const hasAll = requiredPerms.every(p => userPerms.includes(p));
    if (!hasAll) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Vous n'avez pas la permission requise" });
    }
    return opts.next({ ctx: opts.ctx });
  });
}

// Pre-built permission procedures for common endpoints
export const devisVoirProcedure = protectedProcedure.use(requirePermission("devis.voir"));
export const devisCreerProcedure = protectedProcedure.use(requirePermission("devis.creer"));
export const devisSupprimerProcedure = protectedProcedure.use(requirePermission("devis.supprimer"));
export const facturesVoirProcedure = protectedProcedure.use(requirePermission("factures.voir"));
export const facturesCreerProcedure = protectedProcedure.use(requirePermission("factures.creer"));
export const facturesSupprimerProcedure = protectedProcedure.use(requirePermission("factures.supprimer"));
export const comptaVoirProcedure = protectedProcedure.use(requirePermission("comptabilite.voir"));
export const utilisateursGererProcedure = protectedProcedure.use(requirePermission("utilisateurs.gerer"));
