import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { DbClient } from "../../../../shared/db";
import { outboxEvent } from "../../../../shared/events/outbox-event";
import { withOutbox } from "../../../../shared/events/with-outbox";
import type { IBadgeRepository } from "../../application/badge-repository";
import { listBadges, listBadgesDuTechnicien, listObjectifsDuTechnicien, getClassementTechniciens } from "../../application/read-use-cases";
import { creerBadge, modifierBadge, supprimerBadge, attribuerBadge, calculerClassement, verifierBadges } from "../../application/write-use-cases";

const categorie = z.enum(["interventions", "avis", "ca", "anciennete", "special"]);

/*
 * Bornes alignées sur la table `badges` (code 50, nom 100, icone 50, couleur 20)
 * — defense-in-depth contre une entrée surdimensionnée.
 */
const createSchema = z.object({
  code: z.string().min(1).max(50),
  nom: z.string().min(1).max(100),
  description: z.string().max(2000).nullish(),
  icone: z.string().max(50).nullish(),
  couleur: z.string().max(20).nullish(),
  categorie: categorie.optional(),
  condition: z.string().max(2000).nullish(),
  seuil: z.number().int().nullish(),
  points: z.number().int().optional(),
  actif: z.boolean().optional(),
});

const updateSchema = z.object({
  nom: z.string().min(1).max(100).optional(),
  description: z.string().max(2000).nullish(),
  icone: z.string().max(50).nullish(),
  couleur: z.string().max(20).nullish(),
  categorie: categorie.optional(),
  condition: z.string().max(2000).nullish(),
  seuil: z.number().int().nullish(),
  points: z.number().int().optional(),
  actif: z.boolean().optional(),
});

/*
 * Routeur tRPC du domaine badges. Transport mince : valide les inputs (zod), délègue aux
 * use-cases (scoping tenant + anti-IDOR portés par le repo via ctx.tenant), laisse remonter
 * les Domain errors (NotFound→404, Validation→400). Repository injecté (DI) → testable.
 * La logique dérivée (verifierBadges / classement) est traitée à une étape ultérieure.
 */
export function createBadgesRouter(repo: IBadgeRepository, db?: DbClient) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listBadges(repo, ctx.tenant)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await creerBadge(r, ctx.tenant, input);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "badge.cree", entityType: "badge", entityId: result.id, payload: { nom: result.nom, critere: result.condition, points: result.points } });
          return result;
        });
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number().int(), data: updateSchema }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await modifierBadge(r, ctx.tenant, input.id, input.data);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "badge.modifie", entityType: "badge", entityId: input.id, payload: input.data });
          return result;
        });
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const before = await r.getById(ctx.tenant, input.id);
          await supprimerBadge(r, ctx.tenant, input.id);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "badge.supprime", entityType: "badge", entityId: input.id, payload: { snapshot: { nom: before?.nom } } });
          return { success: true };
        });
      }),

    getBadgesTechnicien: protectedProcedure
      .input(z.object({ technicienId: z.number().int() }))
      .query(({ ctx, input }) => listBadgesDuTechnicien(repo, ctx.tenant, input.technicienId)),

    /*
     * Objectifs mensuels d'un technicien (parité client). ⚠️ données salarié : le repo applique
     * l'anti-IDOR (technicien hors tenant → []). Tri par mois ASC (parité legacy).
     */
    getObjectifsTechnicien: protectedProcedure
      .input(z.object({ technicienId: z.number().int(), annee: z.number().int() }))
      .query(({ ctx, input }) => listObjectifsDuTechnicien(repo, ctx.tenant, input.technicienId, input.annee)),

    attribuerBadge: protectedProcedure
      .input(z.object({ technicienId: z.number().int(), badgeId: z.number().int(), valeurAtteinte: z.number().int().nullish() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await attribuerBadge(r, ctx.tenant, input.technicienId, input.badgeId, input.valeurAtteinte);
          if (tx && result) await outboxEvent(tx, ctx.tenant, { action: "badge.attribue", entityType: "badge", entityId: input.badgeId, payload: { technicienId: input.technicienId, obtenuLe: result.dateObtention, valeurAtteinte: result.valeurAtteinte } });
          return result;
        });
      }),

    getClassement: protectedProcedure
      .input(z.object({ periode: z.enum(["semaine", "mois", "trimestre", "annee"]) }))
      .query(({ ctx, input }) => getClassementTechniciens(repo, ctx.tenant, input.periode)),

    calculerClassement: protectedProcedure
      .input(z.object({ periode: z.enum(["semaine", "mois", "trimestre", "annee"]) }))
      .mutation(({ ctx, input }) => calculerClassement(repo, ctx.tenant, input.periode)),

    verifierBadges: protectedProcedure
      .input(z.object({ technicienId: z.number().int() }))
      .mutation(({ ctx, input }) => verifierBadges(repo, ctx.tenant, input.technicienId)),
  });
}
