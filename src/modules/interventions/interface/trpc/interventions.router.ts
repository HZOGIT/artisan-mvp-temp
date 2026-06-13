import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import { ValidationError } from "../../../../shared/errors";
import type { IInterventionRepository } from "../../application/intervention-repository";
import { listInterventions, getIntervention } from "../../application/read-use-cases";
import {
  creerIntervention,
  modifierIntervention,
  supprimerIntervention,
} from "../../application/write-use-cases";

// Dates reçues en string ISO (sélecteur front) → `Date`, avec rejet propre des dates
// invalides (parité legacy : `new Date("garbage")` ne doit pas finir en timestamp NOT NULL).
function toDate(value: string, champ: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new ValidationError(`${champ} invalide`);
  return d;
}

const statutEnum = z.enum(["planifiee", "en_cours", "terminee", "annulee"]);

// Bornes alignées sur la table `interventions` (defense-in-depth).
const createSchema = z.object({
  clientId: z.number().int(),
  titre: z.string().min(1).max(255),
  description: z.string().max(5000).nullish(),
  dateDebut: z.string(),
  dateFin: z.string().nullish(),
  statut: statutEnum.optional(),
  adresse: z.string().max(500).nullish(),
  notes: z.string().max(5000).nullish(),
  technicienId: z.number().int().nullish(),
  devisId: z.number().int().nullish(),
  factureId: z.number().int().nullish(),
});

const updateSchema = z.object({
  titre: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).nullish(),
  dateDebut: z.string().optional(),
  dateFin: z.string().nullish(),
  statut: statutEnum.optional(),
  adresse: z.string().max(500).nullish(),
  notes: z.string().max(5000).nullish(),
  technicienId: z.number().int().nullish(),
  devisId: z.number().int().nullish(),
  factureId: z.number().int().nullish(),
});

// Routeur tRPC du domaine interventions. Transport mince : valide les inputs (zod), convertit
// les dates, délègue aux use-cases (scoping tenant + anti-IDOR-FK via ctx.tenant), laisse
// remonter les Domain errors (NotFound→404, Validation→400). Repo injecté (DI).
export function createInterventionsRouter(repo: IInterventionRepository) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listInterventions(repo, ctx.tenant)),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getIntervention(repo, ctx.tenant, input.id)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(({ ctx, input }) => {
        const { dateDebut, dateFin, ...rest } = input;
        return creerIntervention(repo, ctx.tenant, {
          ...rest,
          dateDebut: toDate(dateDebut, "Date de début"),
          dateFin: dateFin != null ? toDate(dateFin, "Date de fin") : dateFin,
        });
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(({ ctx, input }) => {
        const { id, dateDebut, dateFin, ...rest } = input;
        return modifierIntervention(repo, ctx.tenant, id, {
          ...rest,
          dateDebut: dateDebut != null ? toDate(dateDebut, "Date de début") : undefined,
          dateFin: dateFin != null ? toDate(dateFin, "Date de fin") : dateFin,
        });
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerIntervention(repo, ctx.tenant, input.id);
        return { success: true };
      }),
  });
}
