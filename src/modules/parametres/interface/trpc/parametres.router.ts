import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IParametresRepository } from "../../application/parametres-repository";
import { getParametres } from "../../application/read-use-cases";
import { mettreAJourParametres } from "../../application/write-use-cases";

const decimal = z.string().regex(/^\d+(\.\d{1,2})?$/, "Montant décimal invalide");
const couleur = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur hexadécimale #RRGGBB invalide");

// Bornes alignées sur la table `parametres_artisan` (defense-in-depth). ⚠️ AUCUN compteur de
// numérotation exposé en écriture : compteurDevis/Facture/Avoir sont pilotés par la numérotation
// des documents et absents de ce schéma (les inclure casserait la séquence des numéros).
const updateSchema = z.object({
  prefixeDevis: z.string().min(1).max(10).optional(),
  prefixeFacture: z.string().min(1).max(10).optional(),
  prefixeAvoir: z.string().min(1).max(10).optional(),
  mentionsLegales: z.string().max(5000).nullish(),
  conditionsGenerales: z.string().max(5000).nullish(),
  conditionsPaiementDefaut: z.string().max(5000).nullish(),
  delaiPaiementJours: z.number().int().min(0).nullish(),
  delaiPaiementType: z.enum(["net", "fin_de_mois"]).optional(),
  notificationsEmail: z.boolean().optional(),
  rappelDevisJours: z.number().int().min(0).optional(),
  rappelFactureJours: z.number().int().min(0).optional(),
  objectifCA: decimal.optional(),
  objectifDevis: z.number().int().min(0).optional(),
  objectifClients: z.number().int().min(0).optional(),
  couleurPrincipale: couleur.optional(),
  couleurSecondaire: couleur.optional(),
});

// Routeur tRPC du domaine parametres (configuration artisan, singleton par tenant). Transport
// mince : valide les inputs (zod), délègue aux use-cases (scoping tenant via ctx.tenant), laisse
// remonter les Domain errors (Validation→400). Repo injecté (DI).
export function createParametresRouter(repo: IParametresRepository) {
  return router({
    get: protectedProcedure.query(({ ctx }) => getParametres(repo, ctx.tenant)),

    update: protectedProcedure
      .input(updateSchema)
      .mutation(({ ctx, input }) => mettreAJourParametres(repo, ctx.tenant, input)),
  });
}
