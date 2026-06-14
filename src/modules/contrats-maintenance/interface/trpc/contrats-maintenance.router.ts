import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IContratRepository } from "../../application/contrat-repository";
import { listContrats, getContrat } from "../../application/read-use-cases";
import { creerContrat, modifierContrat, supprimerContrat } from "../../application/write-use-cases";
import { suspendreContrat, reactiverContrat, terminerContrat, annulerContrat } from "../../application/transition-use-cases";

const decimal = z.string().regex(/^\d+(\.\d{1,2})?$/, "Montant décimal invalide");
const typeEnum = z.enum(["maintenance_preventive", "entretien", "depannage", "contrat_service"]);
const periodiciteEnum = z.enum(["mensuel", "trimestriel", "semestriel", "annuel"]);
// `dateDebut`/`dateFin` arrivent en string ISO (transport JSON) ; `z.coerce.date()` → Date.

// Bornes alignées sur la table `contrats_maintenance` (defense-in-depth). ⚠️ Le client NE fournit
// PAS `reference` (générée serveur) ni `statut` (état machine → transitions dédiées en 7/9).
const createSchema = z.object({
  clientId: z.number().int(),
  titre: z.string().min(1).max(255),
  montantHT: decimal,
  periodicite: periodiciteEnum,
  dateDebut: z.coerce.date(),
  type: typeEnum.optional(),
  tauxTVA: decimal.optional(),
  description: z.string().max(5000).nullish(),
  dateFin: z.coerce.date().nullish(),
  reconduction: z.boolean().optional(),
  preavisResiliation: z.number().int().min(0).optional(),
  conditionsParticulieres: z.string().max(5000).nullish(),
  notes: z.string().max(5000).nullish(),
});

const updateSchema = z.object({
  titre: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).nullish(),
  type: typeEnum.optional(),
  montantHT: decimal.optional(),
  tauxTVA: decimal.optional(),
  periodicite: periodiciteEnum.optional(),
  dateDebut: z.coerce.date().optional(),
  dateFin: z.coerce.date().nullish(),
  reconduction: z.boolean().optional(),
  preavisResiliation: z.number().int().min(0).optional(),
  conditionsParticulieres: z.string().max(5000).nullish(),
  notes: z.string().max(5000).nullish(),
});

// Routeur tRPC du domaine contrats-maintenance. Transport mince : valide les inputs (zod), délègue
// aux use-cases (scoping tenant via ctx.tenant + anti-IDOR clientId + référence serveur au use-case),
// laisse remonter les Domain errors (NotFound→404, Validation→400, Conflict→409). ⚠️ Les transitions
// de statut (suspendre/reactiver/terminer/annuler) seront exposées en 7/9. Repo injecté.
export function createContratsMaintenanceRouter(repo: IContratRepository) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listContrats(repo, ctx.tenant)),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getContrat(repo, ctx.tenant, input.id)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(({ ctx, input }) => creerContrat(repo, ctx.tenant, input)),

    update: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return modifierContrat(repo, ctx.tenant, id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerContrat(repo, ctx.tenant, input.id);
        return { success: true };
      }),

    // Transitions de statut (état machine) — chacune valide la légalité depuis le statut courant.
    suspendre: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(({ ctx, input }) => suspendreContrat(repo, ctx.tenant, input.id)),

    reactiver: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(({ ctx, input }) => reactiverContrat(repo, ctx.tenant, input.id)),

    terminer: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(({ ctx, input }) => terminerContrat(repo, ctx.tenant, input.id)),

    annuler: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(({ ctx, input }) => annulerContrat(repo, ctx.tenant, input.id)),
  });
}
