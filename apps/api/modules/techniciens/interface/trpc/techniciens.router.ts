import { z } from "zod";
import { router, protectedProcedure, permissionProcedure, ownerProcedure } from "../../../../interface/trpc/trpc";
import type { DbClient } from "../../../../shared/db";
import { outboxEvent } from "../../../../shared/events/outbox-event";
import { withOutbox } from "../../../../shared/events/with-outbox";
import type { ITechnicienRepository } from "../../application/technicien-repository";
import { listTechniciens, getTechnicien, listDisponibilites, getDernierePosition, listerUtilisateursLiables, listHabilitations, getStatsTechnicien } from "../../application/read-use-cases";
import { creerTechnicien, modifierTechnicien, supprimerTechnicien, definirDisponibilite, enregistrerPosition, ajouterHabilitation, supprimerHabilitation, setSuiviActif } from "../../application/write-use-cases";

const couleur = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide (#RRGGBB attendu)").or(z.literal(""));
const coutHoraire = z.string().regex(/^\d+(\.\d{1,2})?$/, "Coût horaire invalide").max(12);
const statut = z.enum(["actif", "inactif", "conge"]);
const typeContrat = z.enum(["cdi", "cdd", "interimaire", "sous_traitant"]);

const gerer = permissionProcedure("techniciens.gerer");

/** Bornes alignées sur la table `techniciens` (defense-in-depth). */
const createSchema = z.object({
  nom: z.string().min(1).max(255),
  prenom: z.string().max(255).nullish(),
  email: z.string().email().max(320).nullish(),
  telephone: z.string().max(20).nullish(),
  specialite: z.string().max(100).nullish(),
  couleur: couleur.nullish(),
  statut: statut.optional(),
  coutHoraire: coutHoraire.nullish(),
  userId: z.number().int().nullish(),
  notes: z.string().max(5000).nullish(),
  typeContrat: typeContrat.nullish(),
});

const updateSchema = z.object({
  nom: z.string().min(1).max(255).optional(),
  prenom: z.string().max(255).nullish(),
  email: z.string().email().max(320).nullish(),
  telephone: z.string().max(20).nullish(),
  specialite: z.string().max(100).nullish(),
  couleur: couleur.nullish(),
  statut: statut.optional(),
  coutHoraire: coutHoraire.nullish(),
  userId: z.number().int().nullish(),
  notes: z.string().max(5000).nullish(),
  typeContrat: typeContrat.nullish(),
});

/*
 * Routeur tRPC du domaine techniciens. Transport mince : valide les inputs (zod), délègue
 * aux use-cases (scoping tenant via ctx.tenant), laisse remonter les Domain errors
 * (NotFound→404, Validation→400). Repository injecté (DI) → testable. `getAll` alias de
 * `list` (parité legacy). `getLinkableUsers` (lecture users du tenant) = étape ultérieure.
 */
export function createTechniciensRouter(repo: ITechnicienRepository, db?: DbClient) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listTechniciens(repo, ctx.tenant)),
    getAll: protectedProcedure.query(({ ctx }) => listTechniciens(repo, ctx.tenant)),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getTechnicien(repo, ctx.tenant, input.id)),

    create: gerer
      .input(createSchema)
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await creerTechnicien(r, ctx.tenant, input);
          ctx.log.info({ event: "technicien_cree", technicienId: result.id, specialite: input.specialite ?? null, lieuUserId: input.userId ?? null }, "Technicien créé");
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "technicien.cree", entityType: "technicien", entityId: result.id, payload: { userId: result.userId, specialite: result.specialite } });
          return result;
        });
      }),

    update: gerer
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        return withOutbox(db, repo, async (r, tx) => {
          const result = await modifierTechnicien(r, ctx.tenant, id, data);
          if (data.statut) {
            const level = data.statut === "inactif" ? "warn" : "info";
            ctx.log[level]({ event: "technicien_statut_changed", technicienId: id, newStatut: data.statut }, `Technicien statut → ${data.statut}`);
          }
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "technicien.modifie", entityType: "technicien", entityId: id, payload: { specialite: result.specialite, statut: result.statut, userId: result.userId } });
          return result;
        });
      }),

    delete: gerer
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const before = await r.getById(ctx.tenant, input.id);
          await supprimerTechnicien(r, ctx.tenant, input.id);
          ctx.log.warn({ event: "technicien_supprime", technicienId: input.id }, "Technicien supprimé");
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "technicien.supprime", entityType: "technicien", entityId: input.id, payload: { snapshot: { technicienId: input.id, specialite: before?.specialite ?? null } } });
          return { success: true };
        });
      }),

    getDisponibilites: protectedProcedure
      .input(z.object({ technicienId: z.number().int() }))
      .query(({ ctx, input }) => listDisponibilites(repo, ctx.tenant, input.technicienId)),

    setDisponibilite: protectedProcedure
      .input(
        z.object({
          technicienId: z.number().int(),
          jourSemaine: z.number().int().min(0).max(6),
          heureDebut: z.string().regex(/^\d{2}:\d{2}$/, "Heure invalide (HH:MM)"),
          heureFin: z.string().regex(/^\d{2}:\d{2}$/, "Heure invalide (HH:MM)"),
          disponible: z.boolean(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { technicienId, ...data } = input;
        return withOutbox(db, repo, async (r, tx) => {
          const result = await definirDisponibilite(r, ctx.tenant, technicienId, data);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "technicien.disponibilite_definie", entityType: "technicien", entityId: technicienId, payload: { jourSemaine: result.jourSemaine, heureDebut: result.heureDebut, heureFin: result.heureFin, disponible: result.disponible } });
          return result;
        });
      }),

    getLinkableUsers: protectedProcedure.query(({ ctx }) => listerUtilisateursLiables(repo, ctx.tenant)),

    getDernierePosition: protectedProcedure
      .input(z.object({ technicienId: z.number().int() }))
      .query(({ ctx, input }) => getDernierePosition(repo, ctx.tenant, input.technicienId)),

    enregistrerPosition: protectedProcedure
      .input(
        z.object({
          technicienId: z.number().int(),
          latitude: z.string().regex(/^-?\d+(\.\d+)?$/, "Latitude invalide"),
          longitude: z.string().regex(/^-?\d+(\.\d+)?$/, "Longitude invalide"),
          precision: z.number().int().nullish(),
          vitesse: z.string().regex(/^\d+(\.\d{1,2})?$/, "Vitesse invalide").nullish(),
          cap: z.number().int().min(0).max(360).nullish(),
          batterie: z.number().int().min(0).max(100).nullish(),
          enDeplacement: z.boolean().optional(),
          interventionEnCoursId: z.number().int().nullish(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { technicienId, ...data } = input;
        return withOutbox(db, repo, async (r, tx) => {
          const result = await enregistrerPosition(r, ctx.tenant, technicienId, data);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "technicien.position_enregistree", entityType: "technicien", entityId: technicienId, payload: { latitude: result.latitude, longitude: result.longitude } });
          return result;
        });
      }),

    /** CNIL — active/désactive le suivi GPS d'un technicien (interrupteur salarié). */
    setSuiviActif: ownerProcedure
      .input(z.object({ technicienId: z.number().int(), actif: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await setSuiviActif(r, ctx.tenant, input.technicienId, input.actif);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "technicien.suivi_modifie", entityType: "technicien", entityId: input.technicienId, payload: { actif: input.actif } });
          return result;
        });
      }),

    /** ── Habilitations / certifications BTP (données salarié — anti-IDOR ownership) ──────────── */
    getHabilitations: protectedProcedure
      .input(z.object({ technicienId: z.number().int() }))
      .query(({ ctx, input }) => listHabilitations(repo, ctx.tenant, input.technicienId)),

    addHabilitation: protectedProcedure
      .input(
        z.object({
          technicienId: z.number().int(),
          type: z.string().trim().min(1).max(255),
          numero: z.string().trim().max(100).optional(),
          organisme: z.string().trim().max(255).optional(),
          dateObtention: z.string().optional(),
          dateExpiration: z.string().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { technicienId, ...data } = input;
        return withOutbox(db, repo, async (r, tx) => {
          const result = await ajouterHabilitation(r, ctx.tenant, technicienId, data);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "technicien.habilitation_ajoutee", entityType: "technicien", entityId: technicienId, payload: { habilitationId: result.id, type: result.type } });
          return result;
        });
      }),

    deleteHabilitation: protectedProcedure
      .input(z.object({ technicienId: z.number().int(), id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          await supprimerHabilitation(r, ctx.tenant, input.technicienId, input.id);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "technicien.habilitation_supprimee", entityType: "technicien", entityId: input.technicienId, payload: { habilitationId: input.id } });
          return { success: true };
        });
      }),

    /** Stats d'activité d'un technicien (interventions par statut). Anti-IDOR : hors tenant → 404. */
    getStats: protectedProcedure
      .input(z.object({ technicienId: z.number().int() }))
      .query(({ ctx, input }) => getStatsTechnicien(repo, ctx.tenant, input.technicienId)),
  });
}
