import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IChantierRepository } from "../../application/chantier-repository";
import { listChantiers, getChantier } from "../../application/read-use-cases";
import { creerChantier, modifierChantier, supprimerChantier } from "../../application/write-use-cases";
import { getPointagesChantier, ajouterPointage, supprimerPointage } from "../../application/pointages-use-cases";
import { getSuiviChantier, creerSuivi, modifierSuivi, supprimerSuivi } from "../../application/suivi-use-cases";
import { getPhasesChantier, creerPhase, modifierPhase, supprimerPhase } from "../../application/phases-use-cases";

const suiviStatutEnum = z.enum(["a_faire", "en_cours", "termine"]);
const phaseStatutEnum = z.enum(["a_faire", "en_cours", "termine", "annule"]);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (format AAAA-MM-JJ attendu)");
const decimal = z.string().regex(/^\d+(\.\d{1,2})?$/, "Montant décimal invalide");
const statutEnum = z.enum(["planifie", "en_cours", "en_pause", "termine", "annule"]);
const prioriteEnum = z.enum(["basse", "normale", "haute", "urgente"]);

// Bornes alignées sur la table `chantiers` (defense-in-depth).
const createSchema = z.object({
  clientId: z.number().int(),
  reference: z.string().min(1).max(50),
  nom: z.string().min(1).max(255),
  description: z.string().max(5000).nullish(),
  adresse: z.string().max(5000).nullish(),
  codePostal: z.string().max(10).nullish(),
  ville: z.string().max(100).nullish(),
  dateDebut: isoDate.nullish(),
  dateFinPrevue: isoDate.nullish(),
  dateFinReelle: isoDate.nullish(),
  budgetPrevisionnel: decimal.nullish(),
  budgetRealise: decimal.optional(),
  statut: statutEnum.optional(),
  avancement: z.number().int().min(0).max(100).optional(),
  priorite: prioriteEnum.optional(),
  notes: z.string().max(5000).nullish(),
});

// ⚠️ `clientId` ABSENT du schéma d'update : le client d'un chantier est immuable.
const updateSchema = z.object({
  reference: z.string().min(1).max(50).optional(),
  nom: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).nullish(),
  adresse: z.string().max(5000).nullish(),
  codePostal: z.string().max(10).nullish(),
  ville: z.string().max(100).nullish(),
  dateDebut: isoDate.nullish(),
  dateFinPrevue: isoDate.nullish(),
  dateFinReelle: isoDate.nullish(),
  budgetPrevisionnel: decimal.nullish(),
  budgetRealise: decimal.optional(),
  statut: statutEnum.optional(),
  avancement: z.number().int().min(0).max(100).optional(),
  priorite: prioriteEnum.optional(),
  notes: z.string().max(5000).nullish(),
});

// Routeur tRPC du domaine chantiers. Transport mince : valide les inputs (zod), délègue aux
// use-cases (scoping tenant + anti-IDOR-FK via ctx.tenant), laisse remonter les Domain errors
// (NotFound→404, Validation→400). Repo injecté (DI).
export function createChantiersRouter(repo: IChantierRepository) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listChantiers(repo, ctx.tenant)),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getChantier(repo, ctx.tenant, input.id)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(({ ctx, input }) => creerChantier(repo, ctx.tenant, input)),

    update: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return modifierChantier(repo, ctx.tenant, id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerChantier(repo, ctx.tenant, input.id);
        return { success: true };
      }),

    // ── Pointages (saisie de temps) — sous-ressource scopée via le chantier parent ────────────────
    getPointages: protectedProcedure
      .input(z.object({ chantierId: z.number().int() }))
      .query(({ ctx, input }) => getPointagesChantier(repo, ctx.tenant, input.chantierId)),

    addPointage: protectedProcedure
      .input(
        z.object({
          chantierId: z.number().int(),
          phaseId: z.number().int().nullish(),
          technicienId: z.number().int().nullish(),
          date: z.string().min(1),
          heures: z.number().positive().max(24, "Maximum 24 h par pointage"),
          description: z.string().trim().max(500).optional(),
        }),
      )
      .mutation(({ ctx, input }) =>
        ajouterPointage(repo, ctx.tenant, {
          chantierId: input.chantierId,
          phaseId: input.phaseId ?? null,
          technicienId: input.technicienId ?? null,
          date: input.date,
          heures: input.heures.toFixed(2),
          description: input.description ?? null,
        }),
      ),

    deletePointage: protectedProcedure
      .input(z.object({ chantierId: z.number().int(), id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerPointage(repo, ctx.tenant, input.chantierId, input.id);
        return { success: true };
      }),

    // ── Suivi (avancement/jalons) — sous-ressource scopée via le chantier parent (anti-IDOR) ──────
    getSuivi: protectedProcedure
      .input(z.object({ chantierId: z.number().int() }))
      .query(({ ctx, input }) => getSuiviChantier(repo, ctx.tenant, input.chantierId)),

    createSuivi: protectedProcedure
      .input(
        z.object({
          chantierId: z.number().int(),
          titre: z.string().min(1).max(255),
          description: z.string().max(5000).nullish(),
          statut: suiviStatutEnum.optional(),
          pourcentage: z.number().int().min(0).max(100).optional(),
          ordre: z.number().int().optional(),
          visibleClient: z.boolean().optional(),
          dateDebut: z.string().nullish(),
          dateFin: z.string().nullish(),
          commentaire: z.string().max(5000).nullish(),
        }),
      )
      .mutation(({ ctx, input }) => creerSuivi(repo, ctx.tenant, input)),

    updateSuivi: protectedProcedure
      .input(
        z.object({
          id: z.number().int(),
          titre: z.string().min(1).max(255).optional(),
          description: z.string().max(5000).nullish(),
          statut: suiviStatutEnum.optional(),
          pourcentage: z.number().int().min(0).max(100).optional(),
          ordre: z.number().int().optional(),
          visibleClient: z.boolean().optional(),
          dateDebut: z.string().nullish(),
          dateFin: z.string().nullish(),
          commentaire: z.string().max(5000).nullish(),
        }),
      )
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return modifierSuivi(repo, ctx.tenant, id, data);
      }),

    deleteSuivi: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerSuivi(repo, ctx.tenant, input.id);
        return { success: true };
      }),

    // ── Phases (planification/lots) — sous-ressource scopée via le chantier parent (anti-IDOR) ────
    getPhases: protectedProcedure
      .input(z.object({ chantierId: z.number().int() }))
      .query(({ ctx, input }) => getPhasesChantier(repo, ctx.tenant, input.chantierId)),

    createPhase: protectedProcedure
      .input(
        z.object({
          chantierId: z.number().int(),
          nom: z.string().min(1).max(255),
          description: z.string().max(65535).nullish(),
          ordre: z.number().int().optional(),
          dateDebutPrevue: z.string().nullish(),
          dateFinPrevue: z.string().nullish(),
          budgetPhase: decimal.nullish(),
          heuresPrevues: decimal.nullish(),
        }),
      )
      .mutation(({ ctx, input }) => creerPhase(repo, ctx.tenant, input)),

    updatePhase: protectedProcedure
      .input(
        z.object({
          id: z.number().int(),
          nom: z.string().min(1).max(255).optional(),
          statut: phaseStatutEnum.optional(),
          avancement: z.number().int().min(0).max(100).optional(),
          dateDebutReelle: z.string().nullish(),
          dateFinReelle: z.string().nullish(),
          coutReel: decimal.nullish(),
          heuresPrevues: decimal.nullish(),
        }),
      )
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return modifierPhase(repo, ctx.tenant, id, data);
      }),

    deletePhase: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerPhase(repo, ctx.tenant, input.id);
        return { success: true };
      }),
  });
}
