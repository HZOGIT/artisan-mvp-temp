import { z } from "zod";
import { TRPCError } from "@trpc/server";
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
  /** image base64 d'une signature manuscrite (~500 Ko) */
  signatureData: z.string().max(500000),
  signataireName: z.string().max(200),
  signataireEmail: z.string().email().max(320),
  /** accepté pour compat client, NON vérifié serveur (parité legacy) */
  smsVerified: z.boolean().optional(),
});
const refuseInput = z.object({ token: z.string().min(1).max(64), motifRefus: z.string().max(2000).optional() });

/*
 * Routeur tRPC du domaine signature. Surface ARTISAN protégée (scoping tenant via ctx.tenant) +
 * surface PUBLIQUE par token (le token EST la capacité ; pas de cookie tenant). Transport mince :
 * valide l'input, délègue aux use-cases, laisse remonter les Domain errors (NotFound→404,
 * Validation→400). Les mutations publiques (selectDevisOption/signDevis/refuseDevis) suivent.
 */
export function createSignatureRouter(deps: SignatureDeps, publicDeps: SignaturePublicDeps) {
  return router({
    /*
     * ── Surface ARTISAN (protégée) ───────────────────────────────────────────────────────────────
     * Signature d'un devis du tenant (null si aucune / hors tenant). Anti-IDOR via le devis parent.
     */
    getSignatureByDevis: protectedProcedure
      .input(devisIdInput)
      .query(({ ctx, input }) => {
        if (!ctx.tenant) throw new TRPCError({ code: "UNAUTHORIZED" });
        return getSignatureByDevis(deps, ctx.tenant, input.devisId);
      }),

    /** Génère (idempotent) le lien de signature d'un devis du tenant + email client + notification. */
    createSignatureLink: protectedProcedure
      .input(devisIdInput)
      .mutation(async ({ ctx, input }) => {
        if (!ctx.tenant) throw new TRPCError({ code: "UNAUTHORIZED" });
        const result = await createSignatureLink(deps, ctx.tenant, input.devisId);
        ctx.log.info({ event: "signature_link_created", devisId: input.devisId }, "Lien de signature généré");
        return result;
      }),

    /*
     * ── Surface PUBLIQUE (portail de signature par token) ─────────────────────────────────────────
     * Affiche le devis à signer (token→signature+devis+artisan+client+lignes+options). 400 si expiré
     * & en_attente ; un devis déjà signé/refusé reste consultable.
     */
    getDevisForSignature: publicProcedure
      .input(tokenInput)
      .query(({ input }) => getDevisForSignature(publicDeps, input.token)),

    /** Le client choisit une option/variante AVANT de signer (400 si déjà signé/expiré, rate-limité). */
    selectDevisOption: publicProcedure
      .input(selectOptionInput)
      .mutation(({ input }) => selectDevisOption(publicDeps, { token: input.token, optionId: input.optionId })),

    /** Signature du devis : immutabilité (statut doit être en_attente) + capture IP probante/UA (ctx). */
    signDevis: publicProcedure
      .input(signInput)
      .mutation(async ({ ctx, input }) => {
        const result = await signDevis(publicDeps, {
          token: input.token,
          signatureData: input.signatureData,
          signataireName: input.signataireName,
          signataireEmail: input.signataireEmail,
          ipAddress: ctx.clientIp,
          userAgent: ctx.userAgent,
        });
        ctx.log.info(
          { event: "devis_signe", signataireName: input.signataireName, signataireEmail: input.signataireEmail, ipAddress: ctx.clientIp },
          "Devis signé par le client",
        );
        return result;
      }),

    /** Refus du devis (+ motif optionnel) : même immutabilité + capture IP/UA. */
    refuseDevis: publicProcedure
      .input(refuseInput)
      .mutation(async ({ ctx, input }) => {
        const result = await refuseDevis(publicDeps, {
          token: input.token,
          motifRefus: input.motifRefus ?? null,
          ipAddress: ctx.clientIp,
          userAgent: ctx.userAgent,
        });
        ctx.log.warn(
          { event: "devis_refuse_client", motif: input.motifRefus ?? null, ipAddress: ctx.clientIp },
          "Devis refusé par le client",
        );
        return result;
      }),
  });
}
