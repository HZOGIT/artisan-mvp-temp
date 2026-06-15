import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { SignatureDeps } from "../../application/use-cases";
import { getSignatureByDevis, createSignatureLink } from "../../application/use-cases";

const devisIdInput = z.object({ devisId: z.number().int() });

// Routeur tRPC du domaine signature (surface ARTISAN protégée). Transport mince : valide l'input,
// délègue aux use-cases (scoping tenant via ctx.tenant), laisse remonter les Domain errors.
// La surface PUBLIQUE par token (getDevisForSignature/selectDevisOption/signDevis/refuseDevis) sera
// ajoutée dans une étape ultérieure (policy RLS public-token + lecture du devis rattaché au token).
export function createSignatureRouter(deps: SignatureDeps) {
  return router({
    // Signature d'un devis du tenant (null si aucune / hors tenant). Anti-IDOR via le devis parent.
    getSignatureByDevis: protectedProcedure
      .input(devisIdInput)
      .query(({ ctx, input }) => getSignatureByDevis(deps, ctx.tenant!, input.devisId)),

    // Génère (idempotent) le lien de signature d'un devis du tenant + email client + notification.
    createSignatureLink: protectedProcedure
      .input(devisIdInput)
      .mutation(({ ctx, input }) => createSignatureLink(deps, ctx.tenant!, input.devisId)),
  });
}
