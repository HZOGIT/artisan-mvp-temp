import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IArtisanRepository } from "../../application/artisan-repository";
import { getProfile, updateProfile } from "../../application/use-cases";
import { isValidSiret } from "../../../../../../packages/contract/validation";

const specialiteEnum = z.enum(["plomberie", "electricite", "chauffage", "multi-services"]);
const formeJuridiqueEnum = z.enum(["EI", "micro", "EURL", "SARL", "SAS", "SASU", "SA", "autre"]);

/*
 * Bornes alignées sur le legacy `artisan.updateProfile` (defense-in-depth + DoS/stockage). `logo` =
 * data-URI base64 (vecteur volumineux) borné à ~3 Mo. IBAN/slug/metier traités au use-case.
 */
const updateSchema = z.object({
  siret: z.string().regex(/^\d{14}$/, "SIRET invalide (14 chiffres requis)").refine(isValidSiret, "SIRET invalide (clé de contrôle incorrecte)").optional().or(z.literal("")),
  nomEntreprise: z.string().max(200).optional(),
  adresse: z.string().max(300).optional(),
  codePostal: z.string().max(10).optional(),
  ville: z.string().max(100).optional(),
  telephone: z.string().max(30).optional(),
  email: z.string().email().max(320).optional(),
  specialite: specialiteEnum.optional(),
  tauxTVA: z.string().max(10).optional(),
  numeroTVA: z.string().max(20).optional(),
  iban: z.string().max(40).optional(),
  codeAPE: z.string().max(10).optional(),
  formeJuridique: formeJuridiqueEnum.optional(),
  capitalSocial: z.string().max(20).optional(),
  villeRCS: z.string().max(100).optional(),
  numeroRM: z.string().max(50).optional(),
  logo: z.string().max(3_000_000).optional(),
  slug: z.string().max(100).optional(),
  metier: z.string().max(50).optional(),
  franchiseTVA: z.boolean().optional(),
  assuranceDecennaleNom: z.string().max(255).nullish(),
  assuranceDecennalePolice: z.string().max(100).nullish(),
  assuranceDecennaleGarantie: z.string().max(255).nullish(),
});

/*
 * Routeur tRPC du profil artisan (entreprise du tenant). Transport mince ; le profil est toujours
 * celui du tenant courant (`ctx.tenant`). Domain errors → 404/400/409.
 */
export function createArtisanRouter(repo: IArtisanRepository) {
  return router({
    getProfile: protectedProcedure.query(({ ctx }) => getProfile(repo, ctx.tenant)),

    updateProfile: protectedProcedure
      .input(updateSchema)
      .mutation(async ({ ctx, input }) => {
        const result = await updateProfile(repo, ctx.tenant, input);
        const changedFields = Object.keys(input).filter((k) => input[k as keyof typeof input] !== undefined);
        ctx.log.warn(
          {
            event: "artisan_profile_updated",
            changedFields,
            siretChanged: "siret" in input && input.siret !== undefined,
            ibanChanged: "iban" in input && input.iban !== undefined,
            logoChanged: "logo" in input && input.logo !== undefined,
          },
          `Profil artisan mis à jour : ${changedFields.filter((f) => f !== "logo").join(", ")}`,
        );
        return result;
      }),
  });
}
