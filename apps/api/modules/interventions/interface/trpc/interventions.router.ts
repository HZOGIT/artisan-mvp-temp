import { z } from "zod";
import { router, permissionProcedure } from "../../../../interface/trpc/trpc";
// Lecture = `interventions.voir`, écriture/affectation = `interventions.gerer` (parité legacy).
const voir = permissionProcedure("interventions.voir");
const gerer = permissionProcedure("interventions.gerer");
import { ValidationError } from "../../../../shared/errors";
import type { IInterventionRepository } from "../../application/intervention-repository";
import { listInterventions, getIntervention, listMesInterventions } from "../../application/read-use-cases";
import {
  creerIntervention,
  modifierIntervention,
  supprimerIntervention,
} from "../../application/write-use-cases";
import {
  getEquipeIntervention,
  getEquipesArtisan,
  ajouterMembreEquipe,
  retirerMembreEquipe,
  getCouleursCalendrier,
  definirCouleurIntervention,
} from "../../application/equipe-use-cases";
import { assignerTechnicien } from "../../application/assigner-technicien";
import { getSuggestionsTechniciens } from "../../application/suggestions-techniciens";
import type { ICongeRepository } from "../../../conges/application/conge-repository";
import type { ITechnicienRepository } from "../../../techniciens/application/technicien-repository";

/*
 * Dates reçues en string ISO (sélecteur front) → `Date`, avec rejet propre des dates
 * invalides (parité legacy : `new Date("garbage")` ne doit pas finir en timestamp NOT NULL).
 */
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

/*
 * Routeur tRPC du domaine interventions. Transport mince : valide les inputs (zod), convertit
 * les dates, délègue aux use-cases (scoping tenant + anti-IDOR-FK via ctx.tenant), laisse
 * remonter les Domain errors (NotFound→404, Validation→400). Repo injecté (DI).
 */
export function createInterventionsRouter(repo: IInterventionRepository, congeRepo: ICongeRepository, technicienRepo: ITechnicienRepository) {
  return router({
    list: voir.query(({ ctx }) => listInterventions(repo, ctx.tenant)),

    // Vue « mes interventions » : minimisation RGPD (un technicien lié ne voit que les siennes).
    getMine: voir.query(({ ctx }) => listMesInterventions(repo, ctx.tenant)),

    getById: voir
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getIntervention(repo, ctx.tenant, input.id)),

    create: gerer
      .input(createSchema)
      .mutation(({ ctx, input }) => {
        const { dateDebut, dateFin, ...rest } = input;
        return creerIntervention(repo, ctx.tenant, {
          ...rest,
          dateDebut: toDate(dateDebut, "Date de début"),
          dateFin: dateFin != null ? toDate(dateFin, "Date de fin") : dateFin,
        });
      }),

    update: gerer
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(({ ctx, input }) => {
        const { id, dateDebut, dateFin, ...rest } = input;
        return modifierIntervention(repo, ctx.tenant, id, {
          ...rest,
          dateDebut: dateDebut != null ? toDate(dateDebut, "Date de début") : undefined,
          dateFin: dateFin != null ? toDate(dateFin, "Date de fin") : dateFin,
        });
      }),

    delete: gerer
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerIntervention(repo, ctx.tenant, input.id);
        return { success: true };
      }),

    // ── Équipe d'intervention (sous-ressource ; anti-IDOR via intervention parente + technicien du tenant) ──
    getEquipe: voir
      .input(z.object({ interventionId: z.number().int() }))
      .query(({ ctx, input }) => getEquipeIntervention(repo, ctx.tenant, input.interventionId)),

    getEquipesByArtisan: voir.query(({ ctx }) => getEquipesArtisan(repo, ctx.tenant)),

    ajouterMembreEquipe: gerer
      .input(z.object({ interventionId: z.number().int(), technicienId: z.number().int(), role: z.string().max(50).nullish() }))
      .mutation(({ ctx, input }) => ajouterMembreEquipe(repo, ctx.tenant, input)),

    retirerMembreEquipe: gerer
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await retirerMembreEquipe(repo, ctx.tenant, input.id);
        return { success: true };
      }),

    // ── Couleurs calendrier (préférence d'affichage par artisan, scopée tenant) ───────────────────
    getCouleursCalendrier: voir.query(({ ctx }) => getCouleursCalendrier(repo, ctx.tenant)),

    setCouleurIntervention: gerer
      .input(z.object({ interventionId: z.number().int(), couleur: z.string().max(20) }))
      .mutation(async ({ ctx, input }) => {
        await definirCouleurIntervention(repo, ctx.tenant, input.interventionId, input.couleur);
        return { success: true };
      }),

    /*
     * Affecte un technicien à une intervention (404 intervention / 403 technicien hors tenant) +
     * renvoie les conflits NON bloquants (double-booking + congés approuvés).
     */
    assignerTechnicien: gerer
      .input(z.object({ interventionId: z.number().int(), technicienId: z.number().int() }))
      .mutation(({ ctx, input }) => assignerTechnicien(repo, congeRepo, ctx.tenant, input.interventionId, input.technicienId)),

    /*
     * Suggestions de techniciens pour une intervention géolocalisée (proximité + disponibilité).
     * ⚠️ GÉO/RGPD : positions techniciens scopées tenant (jamais cross-tenant).
     */
    getSuggestionsTechniciens: voir
      .input(z.object({ latitude: z.number(), longitude: z.number(), dateIntervention: z.coerce.date() }))
      .query(({ ctx, input }) => getSuggestionsTechniciens(repo, technicienRepo, ctx.tenant, input)),
  });
}
