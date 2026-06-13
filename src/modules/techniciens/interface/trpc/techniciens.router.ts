import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { ITechnicienRepository } from "../../application/technicien-repository";
import { listTechniciens, getTechnicien, listDisponibilites, getDernierePosition, listerUtilisateursLiables } from "../../application/read-use-cases";
import { creerTechnicien, modifierTechnicien, supprimerTechnicien, definirDisponibilite, enregistrerPosition } from "../../application/write-use-cases";

const couleur = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide (#RRGGBB attendu)").or(z.literal(""));
const coutHoraire = z.string().regex(/^\d+(\.\d{1,2})?$/, "Coût horaire invalide").max(12);
const statut = z.enum(["actif", "inactif", "conge"]);

// Bornes alignées sur la table `techniciens` (defense-in-depth).
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
});

// Routeur tRPC du domaine techniciens. Transport mince : valide les inputs (zod), délègue
// aux use-cases (scoping tenant via ctx.tenant), laisse remonter les Domain errors
// (NotFound→404, Validation→400). Repository injecté (DI) → testable. `getAll` alias de
// `list` (parité legacy). `getLinkableUsers` (lecture users du tenant) = étape ultérieure.
export function createTechniciensRouter(repo: ITechnicienRepository) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listTechniciens(repo, ctx.tenant)),
    getAll: protectedProcedure.query(({ ctx }) => listTechniciens(repo, ctx.tenant)),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getTechnicien(repo, ctx.tenant, input.id)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(({ ctx, input }) => creerTechnicien(repo, ctx.tenant, input)),

    update: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return modifierTechnicien(repo, ctx.tenant, id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerTechnicien(repo, ctx.tenant, input.id);
        return { success: true };
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
      .mutation(({ ctx, input }) => {
        const { technicienId, ...data } = input;
        return definirDisponibilite(repo, ctx.tenant, technicienId, data);
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
      .mutation(({ ctx, input }) => {
        const { technicienId, ...data } = input;
        return enregistrerPosition(repo, ctx.tenant, technicienId, data);
      }),
  });
}
