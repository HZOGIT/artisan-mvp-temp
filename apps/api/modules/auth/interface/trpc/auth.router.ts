import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../../../../interface/trpc/trpc";
import { clearAuthCookie, setAuthCookie } from "../../../../interface/http/auth-cookie";
import type { AuthDeps } from "../../application/use-cases";
import { deleteAccount, forgotPassword, me, resetPassword, signin, signup, updateEmail, updatePassword } from "../../application/use-cases";

/*
 * Routeur tRPC `auth` (slice session : me/signin/logout — publics). Le cookie `token` est posé/effacé
 * via `ctx.res` (Fastify). signup/updateEmail/updatePassword/forgotPassword/resetPassword/deleteAccount
 * viennent dans des firings ultérieurs avant l'activation du domaine.
 */
export function createAuthRouter(deps: AuthDeps) {
  return router({
    /** Utilisateur courant (null si non authentifié / inactif). Public (pas d'exigence de tenant). */
    me: publicProcedure.query(({ ctx }) => me(deps.repo, ctx.claims, ctx.permissions)),

    /** Login : vérifie le mot de passe (bcrypt), émet le JWT et pose le cookie httpOnly. */
    signin: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { user, token } = await signin(deps, input);
        if (ctx.res) setAuthCookie(ctx.res, token);
        return { success: true as const, user };
      }),

    /** Signup : crée le compte + provisionne (bootstrap), émet le JWT et pose le cookie. Email pris → 409. */
    signup: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string().min(6), name: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { user, token } = await signup(deps, input);
        if (ctx.res) setAuthCookie(ctx.res, token);
        return { success: true as const, user };
      }),

    /** Logout : efface le cookie d'auth. */
    logout: publicProcedure.mutation(({ ctx }) => {
      if (ctx.res) clearAuthCookie(ctx.res);
      return { success: true as const };
    }),

    /** ── Self-service (utilisateur authentifié) ─────────────────────────────────────────────────── */
    updateEmail: protectedProcedure
      .input(z.object({ newEmail: z.string().email() }))
      .mutation(({ ctx, input }) => updateEmail(deps, ctx.tenant.userId, input.newEmail)),

    updatePassword: protectedProcedure
      .input(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(6) }))
      .mutation(({ ctx, input }) => updatePassword(deps, ctx.tenant.userId, input.currentPassword, input.newPassword)),

    deleteAccount: protectedProcedure
      .input(z.object({ confirmation: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const r = await deleteAccount(deps, ctx.tenant.userId, input.confirmation);
        /** déconnecte après suppression */
        if (ctx.res) clearAuthCookie(ctx.res);
        return r;
      }),

    /** ── Reset mot de passe (public, anti-énumération) ──────────────────────────────────────────── */
    forgotPassword: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(({ input }) => forgotPassword(deps, input.email)),

    resetPassword: publicProcedure
      .input(z.object({ token: z.string().min(1), newPassword: z.string().min(6) }))
      .mutation(({ input }) => resetPassword(deps, input.token, input.newPassword)),
  });
}
