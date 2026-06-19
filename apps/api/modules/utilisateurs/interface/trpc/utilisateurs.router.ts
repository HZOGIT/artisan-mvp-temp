import { z } from "zod";
import { router, permissionProcedure } from "../../../../interface/trpc/trpc";
import type { UtilisateurDeps } from "../../application/use-cases";
import { basculerActif, changerRole, definirPermissions, inviterUtilisateur, lirePermissions, listUtilisateurs, reinitialiserPermissions } from "../../application/use-cases";

const roleEnum = z.enum(["artisan", "secretaire", "technicien"]);

/*
 * Toutes les procédures sont gardées par la permission `utilisateurs.gerer` (admin bypasse). Parité
 * legacy `utilisateursGererProcedure`.
 */
const gere = permissionProcedure("utilisateurs.gerer");

export function createUtilisateursRouter(deps: UtilisateurDeps) {
  return router({
    list: gere.query(({ ctx }) => listUtilisateurs(deps, ctx.tenant)),

    invite: gere
      .input(z.object({ email: z.string().email().max(320), nom: z.string().min(1).max(255), prenom: z.string().max(255).optional(), role: roleEnum }))
      .mutation(async ({ ctx, input }) => {
        const result = await inviterUtilisateur(deps, ctx.tenant, input);
        ctx.log.info({ event: "user_invited", targetRole: input.role }, "Collaborateur invité");
        return result;
      }),

    updateRole: gere
      .input(z.object({ userId: z.number().int(), role: roleEnum }))
      .mutation(async ({ ctx, input }) => {
        const result = await changerRole(deps, ctx.tenant, input.userId, input.role);
        ctx.log.warn({ event: "user_role_changed", targetUserId: input.userId, newRole: input.role }, "Rôle utilisateur modifié");
        return result;
      }),

    toggleActif: gere
      .input(z.object({ userId: z.number().int(), actif: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const result = await basculerActif(deps, ctx.tenant, input.userId, input.actif);
        const level = input.actif ? "info" : "warn";
        ctx.log[level]({ event: "user_access_toggled", targetUserId: input.userId, actif: input.actif }, input.actif ? "Accès collaborateur réactivé" : "Accès collaborateur désactivé");
        return result;
      }),

    getPermissions: gere
      .input(z.object({ userId: z.number().int() }))
      .query(({ ctx, input }) => lirePermissions(deps, ctx.tenant, input.userId)),

    updatePermissions: gere
      .input(z.object({ userId: z.number().int(), permissions: z.array(z.string().max(100)).max(200) }))
      .mutation(async ({ ctx, input }) => {
        const result = await definirPermissions(deps, ctx.tenant, input.userId, input.permissions);
        ctx.log.warn({ event: "user_permissions_updated", targetUserId: input.userId, count: input.permissions.length }, "Permissions collaborateur mises à jour");
        return result;
      }),

    resetPermissions: gere
      .input(z.object({ userId: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const result = await reinitialiserPermissions(deps, ctx.tenant, input.userId);
        ctx.log.info({ event: "user_permissions_reset", targetUserId: input.userId }, "Permissions collaborateur réinitialisées");
        return result;
      }),
  });
}
