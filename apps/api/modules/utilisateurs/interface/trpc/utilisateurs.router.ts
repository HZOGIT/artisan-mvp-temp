import { z } from "zod";
import { router, permissionProcedure } from "../../../../interface/trpc/trpc";
import type { UtilisateurDeps } from "../../application/use-cases";
import { basculerActif, changerRole, definirPermissions, inviterUtilisateur, lirePermissions, listUtilisateurs, reinitialiserPermissions } from "../../application/use-cases";

const roleEnum = z.enum(["artisan", "secretaire", "technicien"]);

// Toutes les procédures sont gardées par la permission `utilisateurs.gerer` (admin bypasse). Parité
// legacy `utilisateursGererProcedure`.
const gere = permissionProcedure("utilisateurs.gerer");

export function createUtilisateursRouter(deps: UtilisateurDeps) {
  return router({
    list: gere.query(({ ctx }) => listUtilisateurs(deps, ctx.tenant)),

    invite: gere
      .input(z.object({ email: z.string().email().max(320), nom: z.string().min(1).max(255), prenom: z.string().max(255).optional(), role: roleEnum }))
      .mutation(({ ctx, input }) => inviterUtilisateur(deps, ctx.tenant, input)),

    updateRole: gere
      .input(z.object({ userId: z.number().int(), role: roleEnum }))
      .mutation(({ ctx, input }) => changerRole(deps, ctx.tenant, input.userId, input.role)),

    toggleActif: gere
      .input(z.object({ userId: z.number().int(), actif: z.boolean() }))
      .mutation(({ ctx, input }) => basculerActif(deps, ctx.tenant, input.userId, input.actif)),

    getPermissions: gere
      .input(z.object({ userId: z.number().int() }))
      .query(({ ctx, input }) => lirePermissions(deps, ctx.tenant, input.userId)),

    updatePermissions: gere
      .input(z.object({ userId: z.number().int(), permissions: z.array(z.string().max(100)).max(200) }))
      .mutation(({ ctx, input }) => definirPermissions(deps, ctx.tenant, input.userId, input.permissions)),

    resetPermissions: gere
      .input(z.object({ userId: z.number().int() }))
      .mutation(({ ctx, input }) => reinitialiserPermissions(deps, ctx.tenant, input.userId)),
  });
}
