import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IArtisanRepository } from "../../application/artisan-repository";
import { getProfile, updateProfile } from "../../application/use-cases";
import { UnauthorizedError, ValidationError } from "../../../../shared/errors";
import type { IAuthRepository } from "../../../auth/application/auth-repository";
import type { PasswordHasher } from "../../../../shared/ports/password-hasher";
import type { EmailPort } from "../../../../shared/ports/email";
import { ibanChangedEmail } from "../../application/emails";
import { SiretSchema } from "../../../../../../packages/contract/validation";

export interface ArtisanSecurityDeps {
  readonly authRepo: IAuthRepository;
  readonly hasher: PasswordHasher;
  readonly email?: EmailPort;
}

const specialiteEnum = z.enum(["plomberie", "electricite", "chauffage", "multi-services"]);
const formeJuridiqueEnum = z.enum(["EI", "micro", "EURL", "SARL", "SAS", "SASU", "SA", "autre"]);

/*
 * Bornes alignées sur le legacy `artisan.updateProfile` (defense-in-depth + DoS/stockage). `logo` =
 * data-URI base64 (vecteur volumineux) borné à ~3 Mo. IBAN/slug/metier traités au use-case.
 * `currentPassword` : ré-auth obligatoire pour modifier l'IBAN (anti-redirection de virement).
 */
const updateSchema = z.object({
  siret: SiretSchema,
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
  currentPassword: z.string().optional(),
});

/*
 * Routeur tRPC du profil artisan (entreprise du tenant). Transport mince ; le profil est toujours
 * celui du tenant courant (`ctx.tenant`). Domain errors → 404/400/409.
 */
export function createArtisanRouter(repo: IArtisanRepository, security: ArtisanSecurityDeps) {
  return router({
    getProfile: protectedProcedure.query(({ ctx }) => getProfile(repo, ctx.tenant)),

    updateProfile: protectedProcedure
      .input(updateSchema)
      .mutation(async ({ ctx, input }) => {
        const { currentPassword, ...profileInput } = input;

        let credEmail: string | null = null;
        let ibanActuallyChanged = false;
        if (profileInput.iban !== undefined) {
          const cred = await security.authRepo.findCredentialsById(ctx.tenant.userId);
          if (!cred || !cred.actif) {
            throw new UnauthorizedError("Compte inactif");
          }
          if (!currentPassword) {
            throw new ValidationError("Mot de passe requis pour modifier l'IBAN");
          }
          if (!cred.password || !(await security.hasher.verify(currentPassword, cred.password))) {
            throw new UnauthorizedError("Mot de passe incorrect");
          }
          credEmail = cred.email;
          const current = await getProfile(repo, ctx.tenant);
          ibanActuallyChanged = profileInput.iban !== (current?.iban ?? "");
        }

        const result = await updateProfile(repo, ctx.tenant, profileInput);

        if (ibanActuallyChanged && security.email && credEmail) {
          try {
            await security.email.send({ to: credEmail, subject: "Votre IBAN de facturation a été modifié", body: ibanChangedEmail() });
          } catch { /* best-effort */ }
        }

        const changedFields = Object.keys(profileInput).filter((k) => profileInput[k as keyof typeof profileInput] !== undefined);
        ctx.log.warn(
          {
            event: "artisan_profile_updated",
            changedFields,
            siretChanged: "siret" in profileInput && profileInput.siret !== undefined,
            ibanChanged: "iban" in profileInput && profileInput.iban !== undefined,
            logoChanged: "logo" in profileInput && profileInput.logo !== undefined,
          },
          `Profil artisan mis à jour : ${changedFields.filter((f) => f !== "logo").join(", ")}`,
        );
        return result;
      }),
  });
}
