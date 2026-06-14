import { z } from "zod";
import { router, publicProcedure } from "../../../../interface/trpc/trpc";
import { clearAuthCookie, setAuthCookie } from "../../../../interface/http/auth-cookie";
import type { AuthDeps } from "../../application/use-cases";
import { me, signin } from "../../application/use-cases";

// Routeur tRPC `auth` (slice session : me/signin/logout — publics). Le cookie `token` est posé/effacé
// via `ctx.res` (Fastify). signup/updateEmail/updatePassword/forgotPassword/resetPassword/deleteAccount
// viennent dans des firings ultérieurs avant l'activation du domaine.
export function createAuthRouter(deps: AuthDeps) {
  return router({
    // Utilisateur courant (null si non authentifié / inactif). Public (pas d'exigence de tenant).
    me: publicProcedure.query(({ ctx }) => me(deps.repo, ctx.claims, ctx.permissions)),

    // Login : vérifie le mot de passe (bcrypt), émet le JWT et pose le cookie httpOnly.
    signin: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { user, token } = await signin(deps, input);
        if (ctx.res) setAuthCookie(ctx.res, token);
        return { success: true as const, user };
      }),

    // Logout : efface le cookie d'auth.
    logout: publicProcedure.mutation(({ ctx }) => {
      if (ctx.res) clearAuthCookie(ctx.res);
      return { success: true as const };
    }),
  });
}
