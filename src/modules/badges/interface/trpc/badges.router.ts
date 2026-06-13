import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IBadgeRepository } from "../../application/badge-repository";
import { listBadges, listBadgesDuTechnicien, getClassementTechniciens } from "../../application/read-use-cases";
import { creerBadge, modifierBadge, supprimerBadge, attribuerBadge, calculerClassement } from "../../application/write-use-cases";

const categorie = z.enum(["interventions", "avis", "ca", "anciennete", "special"]);

// Bornes alignées sur la table `badges` (code 50, nom 100, icone 50, couleur 20)
// — defense-in-depth contre une entrée surdimensionnée.
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

// Routeur tRPC du domaine badges. Transport mince : valide les inputs (zod), délègue aux
// use-cases (scoping tenant + anti-IDOR portés par le repo via ctx.tenant), laisse remonter
// les Domain errors (NotFound→404, Validation→400). Repository injecté (DI) → testable.
// La logique dérivée (verifierBadges / classement) est traitée à une étape ultérieure.
export function createBadgesRouter(repo: IBadgeRepository) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listBadges(repo, ctx.tenant)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(({ ctx, input }) => creerBadge(repo, ctx.tenant, input)),

    update: protectedProcedure
      .input(z.object({ id: z.number().int(), data: updateSchema }))
      .mutation(({ ctx, input }) => modifierBadge(repo, ctx.tenant, input.id, input.data)),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerBadge(repo, ctx.tenant, input.id);
        return { success: true };
      }),

    getBadgesTechnicien: protectedProcedure
      .input(z.object({ technicienId: z.number().int() }))
      .query(({ ctx, input }) => listBadgesDuTechnicien(repo, ctx.tenant, input.technicienId)),

    attribuerBadge: protectedProcedure
      .input(z.object({ technicienId: z.number().int(), badgeId: z.number().int(), valeurAtteinte: z.number().int().nullish() }))
      .mutation(({ ctx, input }) => attribuerBadge(repo, ctx.tenant, input.technicienId, input.badgeId, input.valeurAtteinte)),

    getClassement: protectedProcedure
      .input(z.object({ periode: z.enum(["semaine", "mois", "trimestre", "annee"]) }))
      .query(({ ctx, input }) => getClassementTechniciens(repo, ctx.tenant, input.periode)),

    calculerClassement: protectedProcedure
      .input(z.object({ periode: z.enum(["semaine", "mois", "trimestre", "annee"]) }))
      .mutation(({ ctx, input }) => calculerClassement(repo, ctx.tenant, input.periode)),
  });
}
