import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../../../../interface/trpc/trpc";
import type { SignatureDeps } from "../../application/use-cases";
import { getSignatureByDevis, createSignatureLink } from "../../application/use-cases";
import type { SignaturePublicDeps } from "../../application/public-use-cases";
import {
  getDevisForSignature,
  selectDevisOption,
  signDevis,
  refuseDevis,
} from "../../application/public-use-cases";

const devisIdInput = z.object({ devisId: z.number().int() });
const tokenInput = z.object({ token: z.string().min(1).max(64) });
const selectOptionInput = z.object({ token: z.string().min(1).max(64), optionId: z.number().int() });
const signInput = z.object({
  token: z.string().min(1).max(64),
  signatureData: z.string().max(500000), // image base64 d'une signature manuscrite (~500 Ko)
  signataireName: z.string().max(200),
  signataireEmail: z.string().email().max(320),
  smsVerified: z.boolean().optional(), // accepté pour compat client, NON vérifié serveur (parité legacy)
});
const refuseInput = z.object({ token: z.string().min(1).max(64), motifRefus: z.string().max(2000).optional() });

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

    // Le client choisit une option/variante AVANT de signer (400 si déjà signé/expiré, rate-limité).
    selectDevisOption: publicProcedure
      .input(selectOptionInput)
      .mutation(({ input }) => selectDevisOption(publicDeps, { token: input.token, optionId: input.optionId })),

    // Signature du devis : immutabilité (statut doit être en_attente) + capture IP probante/UA (ctx).
    signDevis: publicProcedure
      .input(signInput)
      .mutation(({ ctx, input }) =>
        signDevis(publicDeps, {
          token: input.token,
          signatureData: input.signatureData,
          signataireName: input.signataireName,
          signataireEmail: input.signataireEmail,
          ipAddress: ctx.clientIp,
          userAgent: ctx.userAgent,
        }),
      ),

    // Refus du devis (+ motif optionnel) : même immutabilité + capture IP/UA.
    refuseDevis: publicProcedure
      .input(refuseInput)
      .mutation(({ ctx, input }) =>
        refuseDevis(publicDeps, {
          token: input.token,
          motifRefus: input.motifRefus ?? null,
          ipAddress: ctx.clientIp,
          userAgent: ctx.userAgent,
        }),
      ),
  });
}
