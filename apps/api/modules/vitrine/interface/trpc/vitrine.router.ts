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
  consentementMarketing: z.literal(true),
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
    submitContact: publicProcedure.input(submitSchema).mutation(async ({ ctx, input }) => {
      const result = await submitContact(deps, input, ctx.clientIp);
      /** slug identifie l'artisan cible — KPI : nombre de leads par vitrine. Aucune donnée PII loggée. */
      ctx.log.info({ event: "vitrine_contact_soumis", slug: input.slug, hasPhone: input.telephone != null }, "Formulaire contact vitrine soumis");
      return result;
    }),
    getDemandesContact: protectedProcedure.query(({ ctx }) => getDemandesContact(deps, ctx.tenant)),
    updateDemandeContactStatut: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), statut: statutEnum }))
      .mutation(async ({ ctx, input }) => {
        const result = await updateDemandeContactStatut(deps, ctx.tenant, input.id, input.statut);
        const level = input.statut === "perdu" ? "warn" : "info";
        ctx.log[level]({ event: "vitrine_lead_statut_changed", demandeId: input.id, newStatut: input.statut }, `Lead vitrine → ${input.statut}`);
        return result;
      }),
    convertirDemandeEnClient: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const result = await convertirDemandeEnClient(deps, ctx.tenant, input.id);
        ctx.log.info({ event: "vitrine_lead_converti", demandeId: input.id }, "Lead vitrine converti en client");
        return result;
      }),
    /*
     * Réglages vitrine (ADMIN, scopé tenant). Lecture + mise à jour partielle des colonnes
     * `vitrine*` de `parametres_artisan`. Consommé par la section « Ma page vitrine » de `/v2/parametres`.
     */
    getSettings: protectedProcedure.query(({ ctx }) => getVitrineSettings(deps.settings, ctx.tenant)),
    updateSettings: protectedProcedure
      .input(settingsSchema)
      .mutation(async ({ ctx, input }) => {
        const result = await updateVitrineSettings(deps.settings, ctx.tenant, input);
        const level = input.vitrineActive === false ? "warn" : "info";
        ctx.log[level]({ event: "vitrine_settings_updated", vitrineActive: input.vitrineActive ?? null }, "Réglages vitrine mis à jour");
        return result;
      }),
  });
}
