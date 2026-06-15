import { z } from "zod";
import { router, permissionProcedure } from "../../../../interface/trpc/trpc";
// Lecture = `contrats.voir`, écriture/transitions/facturation = `contrats.gerer` (parité legacy).
const voir = permissionProcedure("contrats.voir");
const gerer = permissionProcedure("contrats.gerer");
import type { IContratRepository } from "../../application/contrat-repository";
import type { ContratFactureGenerator } from "../../application/contrat-facture-generator";
import { listContrats, getContrat } from "../../application/read-use-cases";
import { creerContrat, modifierContrat, supprimerContrat } from "../../application/write-use-cases";
import { suspendreContrat, reactiverContrat, terminerContrat, annulerContrat } from "../../application/transition-use-cases";
import {
  listContratsAFacturer,
  getInterventionsContrat,
  creerInterventionContrat,
  modifierInterventionContrat,
  genererFactureContrat,
} from "../../application/interventions-use-cases";

const decimal = z.string().regex(/^\d+(\.\d{1,2})?$/, "Montant décimal invalide");
const typeEnum = z.enum(["maintenance_preventive", "entretien", "depannage", "contrat_service"]);
const periodiciteEnum = z.enum(["mensuel", "trimestriel", "semestriel", "annuel"]);
const interventionStatutEnum = z.enum(["planifiee", "en_cours", "effectuee", "annulee"]);
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
export function createContratsMaintenanceRouter(repo: IContratRepository, factureGen: ContratFactureGenerator) {
  return router({
    list: voir.query(({ ctx }) => listContrats(repo, ctx.tenant)),

    getById: voir
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getContrat(repo, ctx.tenant, input.id)),

    create: gerer
      .input(createSchema)
      .mutation(({ ctx, input }) => creerContrat(repo, ctx.tenant, input)),

    update: gerer
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return modifierContrat(repo, ctx.tenant, id, data);
      }),

    delete: gerer
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerContrat(repo, ctx.tenant, input.id);
        return { success: true };
      }),

    // Transitions de statut (état machine) — chacune valide la légalité depuis le statut courant.
    suspendre: gerer
      .input(z.object({ id: z.number().int() }))
      .mutation(({ ctx, input }) => suspendreContrat(repo, ctx.tenant, input.id)),

    reactiver: gerer
      .input(z.object({ id: z.number().int() }))
      .mutation(({ ctx, input }) => reactiverContrat(repo, ctx.tenant, input.id)),

    terminer: gerer
      .input(z.object({ id: z.number().int() }))
      .mutation(({ ctx, input }) => terminerContrat(repo, ctx.tenant, input.id)),

    annuler: gerer
      .input(z.object({ id: z.number().int() }))
      .mutation(({ ctx, input }) => annulerContrat(repo, ctx.tenant, input.id)),

    // Contrats arrivés à échéance de facturation (enrichis client/TTC/retard) — parité `getAFacturer`.
    getAFacturer: voir.query(({ ctx }) => listContratsAFacturer(repo, ctx.tenant)),

    // Génère une facture émise pour un contrat (récurrente) — parité `generateFacture`. ⚠️ pas d'écriture FEC.
    generateFacture: gerer
      .input(z.object({ contratId: z.number().int() }))
      .mutation(({ ctx, input }) => genererFactureContrat(repo, factureGen, ctx.tenant, input.contratId)),

    // ── Sous-ressource interventions du contrat (ownership via contrat parent ; anti-IDOR id↔contrat) ──
    getInterventions: voir
      .input(z.object({ contratId: z.number().int() }))
      .query(({ ctx, input }) => getInterventionsContrat(repo, ctx.tenant, input.contratId)),

    createIntervention: gerer
      .input(
        z.object({
          contratId: z.number().int(),
          titre: z.string().min(1).max(255),
          dateIntervention: z.coerce.date(),
          description: z.string().max(5000).nullish(),
          duree: z.string().max(50).nullish(),
          technicienNom: z.string().max(255).nullish(),
          notes: z.string().max(5000).nullish(),
        }),
      )
      .mutation(({ ctx, input }) => creerInterventionContrat(repo, ctx.tenant, input)),

    updateIntervention: gerer
      .input(
        z.object({
          id: z.number().int(),
          contratId: z.number().int(),
          titre: z.string().min(1).max(255).optional(),
          description: z.string().max(5000).nullish(),
          dateIntervention: z.coerce.date().optional(),
          duree: z.string().max(50).nullish(),
          technicienNom: z.string().max(255).nullish(),
          statut: interventionStatutEnum.optional(),
          rapport: z.string().max(5000).nullish(),
          notes: z.string().max(5000).nullish(),
        }),
      )
      .mutation(({ ctx, input }) => {
        const { id, contratId, ...data } = input;
        return modifierInterventionContrat(repo, ctx.tenant, id, contratId, data);
      }),
  });
}
