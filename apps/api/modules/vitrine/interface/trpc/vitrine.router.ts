import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IVitrinePublicReader } from "../../application/vitrine-public-reader";
import type { IVitrineSettingsRepository } from "../../application/vitrine-settings-repository";
import { getVitrineSettings, updateVitrineSettings } from "../../application/settings-use-cases";
import {
  getBySlug,
  submitContact,
  getDemandesContact,
  updateDemandeContactStatut,
  convertirDemandeEnClient,
  type SubmitContactDeps,
  type LeadsAdminDeps,
} from "../../application/use-cases";

const submitSchema = z.object({
  slug: z.string().min(1).max(200),
  nom: z.string().min(1).max(200),
  email: z.string().email().max(320),
  telephone: z.string().max(30).optional(),
  message: z.string().min(10).max(5000),
});

const statutEnum = z.enum(["nouveau", "contacte", "converti", "perdu"]);

const settingsSchema = z.object({
  vitrineActive: z.boolean().optional(),
  vitrineDescription: z.string().max(5000).nullish(),
  vitrineZone: z.string().max(500).nullish(),
  vitrineServices: z.string().max(10000).nullish(),
  vitrineExperience: z.number().int().min(0).max(100).nullish(),
});

export interface VitrineRouterDeps extends SubmitContactDeps, LeadsAdminDeps {
  readonly reader: IVitrinePublicReader;
  readonly settings: IVitrineSettingsRepository;
}

/*
 * Routeur tRPC `vitrine`. Surface PUBLIQUE (par slug, sans cookie) : `getBySlug` (page agrégée) +
 * `submitContact` (message à l'artisan, anti-flood par IP via ctx.clientIp). Surface ADMIN (protégée,
 * gestion des leads) : `getDemandesContact` / `updateDemandeContactStatut` / `convertirDemandeEnClient`,
 * déléguée au domaine migré `demandesContact` (+ `clients` pour la conversion), scopée tenant.
 */
export function createVitrineRouter(deps: VitrineRouterDeps) {
  return router({
    getBySlug: publicProcedure.input(z.object({ slug: z.string().min(1) })).query(({ input }) => getBySlug(deps.reader, input.slug)),
    submitContact: publicProcedure.input(submitSchema).mutation(({ ctx, input }) => submitContact(deps, input, ctx.clientIp)),
    getDemandesContact: protectedProcedure.query(({ ctx }) => getDemandesContact(deps, ctx.tenant)),
    updateDemandeContactStatut: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), statut: statutEnum }))
      .mutation(({ ctx, input }) => updateDemandeContactStatut(deps, ctx.tenant, input.id, input.statut)),
    convertirDemandeEnClient: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ ctx, input }) => convertirDemandeEnClient(deps, ctx.tenant, input.id)),
    /*
     * Réglages vitrine (ADMIN, scopé tenant). Lecture + mise à jour partielle des colonnes
     * `vitrine*` de `parametres_artisan`. Consommé par la section « Ma page vitrine » de `/v2/parametres`.
     */
    getSettings: protectedProcedure.query(({ ctx }) => getVitrineSettings(deps.settings, ctx.tenant)),
    updateSettings: protectedProcedure
      .input(settingsSchema)
      .mutation(({ ctx, input }) => updateVitrineSettings(deps.settings, ctx.tenant, input)),
  });
}
