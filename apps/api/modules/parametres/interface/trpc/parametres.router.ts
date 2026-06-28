import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { DbClient } from "../../../../shared/db";
import { outboxEvent } from "../../../../shared/events/outbox-event";
import { withOutbox } from "../../../../shared/events/with-outbox";
import type { IParametresRepository } from "../../application/parametres-repository";
import { getParametres } from "../../application/read-use-cases";
import { mettreAJourParametres } from "../../application/write-use-cases";

const decimal = z.string().regex(/^\d+(\.\d{1,2})?$/, "Montant décimal invalide");
const couleur = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur hexadécimale #RRGGBB invalide");

/*
 * Bornes alignées sur la table `parametres_artisan` (defense-in-depth). ⚠️ AUCUN compteur de
 * numérotation exposé en écriture : compteurDevis/Facture/Avoir sont pilotés par la numérotation
 * des documents et absents de ce schéma (les inclure casserait la séquence des numéros).
 */
const updateSchema = z.object({
  prefixeDevis: z.string().min(1).max(10).optional(),
  prefixeFacture: z.string().min(1).max(10).optional(),
  prefixeAvoir: z.string().min(1).max(10).optional(),
  mentionsLegales: z.string().max(5000).nullish(),
  conditionsGenerales: z.string().max(5000).nullish(),
  mediateurConsommation: z.string().max(1000).nullish(),
  conditionsPaiementDefaut: z.string().max(5000).nullish(),
  delaiPaiementJours: z.number().int().min(0).nullish(),
  delaiPaiementType: z.enum(["net", "fin_de_mois"]).optional(),
  notificationsEmail: z.boolean().optional(),
  rappelDevisJours: z.number().int().min(0).optional(),
  rappelFactureJours: z.number().int().min(0).optional(),
  rappelRdvClientActif: z.boolean().optional(),
  objectifCA: decimal.optional(),
  objectifDevis: z.number().int().min(0).optional(),
  objectifClients: z.number().int().min(0).optional(),
  couleurPrincipale: couleur.optional(),
  couleurSecondaire: couleur.optional(),
  tauxIndemniteKm: z.string().regex(/^\d+(\.\d{1,3})?$/, "Taux kilométrique invalide (ex: 0.529)").nullish(),
});

/*
 * Routeur tRPC du domaine parametres (configuration artisan, singleton par tenant). Transport
 * mince : valide les inputs (zod), délègue aux use-cases (scoping tenant via ctx.tenant), laisse
 * remonter les Domain errors (Validation→400). Repo injecté (DI).
 */
export function createParametresRouter(repo: IParametresRepository, db?: DbClient) {
  return router({
    get: protectedProcedure.query(({ ctx }) => getParametres(repo, ctx.tenant)),

    update: protectedProcedure
      .input(updateSchema)
      .mutation(async ({ ctx, input }) => {
        const champsModifies = Object.keys(input).filter((k) => input[k as keyof typeof input] !== undefined);
        return withOutbox(db, repo, async (r, tx) => {
          const result = await mettreAJourParametres(r, ctx.tenant, input);
          ctx.log.warn({ event: "parametres_updated", champsModifies }, `Paramètres artisan modifiés : ${champsModifies.join(", ")}`);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "parametres.mis_a_jour", entityType: "parametres", entityId: ctx.tenant.artisanId, payload: { champsModifies } });
          return result;
        });
      }),
  });
}
