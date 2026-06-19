import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import { contacterSupport, type SupportDeps } from "../../application/use-cases";

/** Bornes alignées sur le legacy (defense-in-depth). `sujet` = enum fermé. */
const contactSchema = z.object({
  nom: z.string().min(1).max(120),
  email: z.string().email(),
  sujet: z.enum(["technique", "facturation", "suggestion", "autre"]),
  message: z.string().min(10).max(5000),
});

/*
 * Routeur tRPC du domaine `support` (formulaire de contact → email à l'équipe). Transport mince :
 * valide l'input (zod), délègue au use-case (anti-flood + envoi), laisse remonter TooManyRequestsError
 * (→ TOO_MANY_REQUESTS). Authentifié (protectedProcedure : l'anti-flood est par utilisateur).
 */
export function createSupportRouter(deps: SupportDeps) {
  return router({
    contact: protectedProcedure
      .input(contactSchema)
      .mutation(({ ctx, input }) => contacterSupport(deps, ctx.tenant, input)),
  });
}
