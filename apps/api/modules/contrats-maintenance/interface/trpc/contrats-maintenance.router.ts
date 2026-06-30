import { z } from "zod";
import { router, permissionProcedure } from "../../../../interface/trpc/trpc";
/** Lecture = `contrats.voir`, écriture/transitions/facturation = `contrats.gerer` (parité legacy). */
const voir = permissionProcedure("contrats.voir");
const gerer = permissionProcedure("contrats.gerer");
import type { DbClient } from "../../../../shared/db";
import { outboxEvent } from "../../../../shared/events/outbox-event";
import { withOutbox } from "../../../../shared/events/with-outbox";
import type { IContratRepository } from "../../application/contrat-repository";
import type { ContratFactureGenerator } from "../../application/contrat-facture-generator";
import type { IArtisanRepository } from "../../../artisan/application/artisan-repository";
import { listContrats, getContrat } from "../../application/read-use-cases";
import { creerContrat, modifierContrat, supprimerContrat } from "../../application/write-use-cases";
import { suspendreContrat, reactiverContrat, terminerContrat, annulerContrat } from "../../application/transition-use-cases";
import { reviserPrixContrat } from "../../application/revision-use-cases";
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
const tauxIndexation = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/)
  .refine((v) => parseFloat(v) > 0, { message: "Le taux d'indexation doit être supérieur à 0" })
  .nullish();
/** `dateDebut`/`dateFin` arrivent en string ISO (transport JSON) ; `z.coerce.date()` → Date. */

/*
 * Bornes alignées sur la table `contrats_maintenance` (defense-in-depth). ⚠️ Le client NE fournit
 * PAS `reference` (générée serveur) ni `statut` (état machine → transitions dédiées en 7/9).
 */
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
  tauxIndexationAnnuel: tauxIndexation,
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
  tauxIndexationAnnuel: tauxIndexation,
});

/*
 * Routeur tRPC du domaine contrats-maintenance. Transport mince : valide les inputs (zod), délègue
 * aux use-cases (scoping tenant via ctx.tenant + anti-IDOR clientId + référence serveur au use-case),
 * laisse remonter les Domain errors (NotFound→404, Validation→400, Conflict→409). ⚠️ Les transitions
 * de statut (suspendre/reactiver/terminer/annuler) seront exposées en 7/9. Repo injecté.
 */
export function createContratsMaintenanceRouter(repo: IContratRepository, factureGen: ContratFactureGenerator, artisanRepo?: IArtisanRepository, db?: DbClient) {
  return router({
    list: voir.query(({ ctx }) => listContrats(repo, ctx.tenant)),

    getById: voir
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getContrat(repo, ctx.tenant, input.id)),

    create: gerer
      .input(createSchema)
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await creerContrat(r, ctx.tenant, input);
          ctx.log.info({ event: "contrat_cree", contratId: result.id, clientId: input.clientId, montantHT: Number(input.montantHT), periodicite: input.periodicite }, "Contrat maintenance créé");
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "contrat.cree", entityType: "contrat", entityId: result.id, payload: { clientId: result.clientId, typeContrat: result.type, montantAnnuel: result.montantHT, dateDebut: result.dateDebut } });
          return result;
        });
      }),

    update: gerer
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        return withOutbox(db, repo, async (r, tx) => {
          const result = await modifierContrat(r, ctx.tenant, id, data);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "contrat.modifie", entityType: "contrat", entityId: id, payload: { champsModifies: Object.keys(data).filter((k) => (data as Record<string, unknown>)[k] !== undefined) } });
          return result;
        });
      }),

    delete: gerer
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const before = await r.getById(ctx.tenant, input.id);
          await supprimerContrat(r, ctx.tenant, input.id);
          ctx.log.warn({ event: "contrat_supprime", contratId: input.id }, "Contrat maintenance supprimé");
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "contrat.supprime", entityType: "contrat", entityId: input.id, payload: { snapshot: { clientId: before?.clientId, statut: before?.statut, montantAnnuel: before?.montantHT } } });
          return { success: true };
        });
      }),

    /** Transitions de statut (état machine) — chacune valide la légalité depuis le statut courant. */
    suspendre: gerer
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const before = await r.getById(ctx.tenant, input.id);
          const result = await suspendreContrat(r, ctx.tenant, input.id);
          ctx.log.warn({ event: "contrat_suspendu", contratId: input.id }, "Contrat maintenance suspendu");
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "contrat.suspendu", entityType: "contrat", entityId: input.id, payload: { statutAvant: before?.statut, statutApres: result.statut } });
          return result;
        });
      }),

    reactiver: gerer
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const before = await r.getById(ctx.tenant, input.id);
          const result = await reactiverContrat(r, ctx.tenant, input.id);
          ctx.log.info({ event: "contrat_reactive", contratId: input.id }, "Contrat maintenance réactivé");
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "contrat.reactive", entityType: "contrat", entityId: input.id, payload: { statutAvant: before?.statut, statutApres: result.statut } });
          return result;
        });
      }),

    terminer: gerer
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const before = await r.getById(ctx.tenant, input.id);
          const result = await terminerContrat(r, ctx.tenant, input.id);
          ctx.log.warn({ event: "contrat_termine", contratId: input.id }, "Contrat maintenance terminé");
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "contrat.termine", entityType: "contrat", entityId: input.id, payload: { dateFin: result.dateFin, statutAvant: before?.statut } });
          return result;
        });
      }),

    annuler: gerer
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const before = await r.getById(ctx.tenant, input.id);
          const result = await annulerContrat(r, ctx.tenant, input.id);
          ctx.log.warn({ event: "contrat_annule", contratId: input.id }, "Contrat maintenance annulé — churn signal");
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "contrat.annule", entityType: "contrat", entityId: input.id, payload: { statutAvant: before?.statut } });
          return result;
        });
      }),

    /** Contrats arrivés à échéance de facturation (enrichis client/TTC/retard) — parité `getAFacturer`. */
    getAFacturer: voir.query(({ ctx }) => listContratsAFacturer(repo, ctx.tenant)),

    /** Génère une facture émise pour un contrat (récurrente) — parité `generateFacture`. ⚠️ pas d'écriture FEC. */
    generateFacture: gerer
      .input(z.object({ contratId: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const result = await genererFactureContrat(repo, factureGen, ctx.tenant, input.contratId, () => new Date(), artisanRepo);
        ctx.log.info({ event: "contrat_facture_generee", contratId: input.contratId, factureId: result.id }, "Facture contrat maintenance générée");
        return result;
      }),

    /** Révise le prix d'un contrat selon son taux d'indexation annuel (idempotent par année). */
    reviserPrix: gerer
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const result = await reviserPrixContrat(repo, ctx.tenant, input.id);
        ctx.log.info({ event: "contrat_prix_revise", contratId: input.id, ancienMontant: result.ancienMontantHT, nouveauMontant: result.nouveauMontantHT }, "Révision indexation annuelle du prix contrat");
        return result;
      }),

    /** ── Sous-ressource interventions du contrat (ownership via contrat parent ; anti-IDOR id↔contrat) ── */
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
