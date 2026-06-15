import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../../../../interface/trpc/trpc";
import type { SignatureDeps } from "../../application/use-cases";
import { getSignatureByDevis, createSignatureLink } from "../../application/use-cases";
import type { SignaturePublicDeps } from "../../application/public-use-cases";
import { getDevisForSignature } from "../../application/public-use-cases";

const devisIdInput = z.object({ devisId: z.number().int() });
const tokenInput = z.object({ token: z.string().min(1).max(64) });

// Routeur tRPC du domaine signature. Surface ARTISAN protégée (scoping tenant via ctx.tenant) +
// surface PUBLIQUE par token (le token EST la capacité ; pas de cookie tenant). Transport mince :
// valide l'input, délègue aux use-cases, laisse remonter les Domain errors (NotFound→404,
// Validation→400). Les mutations publiques (selectDevisOption/signDevis/refuseDevis) suivent.
export function createSignatureRouter(deps: SignatureDeps, publicDeps: SignaturePublicDeps) {
  return router({
    // ── Surface ARTISAN (protégée) ───────────────────────────────────────────────────────────────
    // Signature d'un devis du tenant (null si aucune / hors tenant). Anti-IDOR via le devis parent.
    getSignatureByDevis: protectedProcedure
      .input(devisIdInput)
      .query(({ ctx, input }) => getSignatureByDevis(deps, ctx.tenant!, input.devisId)),

    // Génère (idempotent) le lien de signature d'un devis du tenant + email client + notification.
    createSignatureLink: protectedProcedure
      .input(devisIdInput)
      .mutation(({ ctx, input }) => createSignatureLink(deps, ctx.tenant!, input.devisId)),

    // ── Surface PUBLIQUE (portail de signature par token) ─────────────────────────────────────────
    // Affiche le devis à signer (token→signature+devis+artisan+client+lignes+options). 400 si expiré
    // & en_attente ; un devis déjà signé/refusé reste consultable.
    getDevisForSignature: publicProcedure
      .input(tokenInput)
      .query(({ input }) => getDevisForSignature(publicDeps, input.token)),
  });
}
