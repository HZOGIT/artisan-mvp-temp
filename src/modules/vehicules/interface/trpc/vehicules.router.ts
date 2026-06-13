import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IVehiculeRepository } from "../../application/vehicule-repository";
import { listVehicules, getVehiculeById } from "../../application/read-use-cases";
import {
  createVehicule,
  updateVehicule,
  deleteVehicule,
  enregistrerKilometrage,
  enregistrerReleveKilometrage,
  ajouterEntretien,
  ajouterAssurance,
} from "../../application/write-use-cases";

const carburant = z.enum(["essence", "diesel", "electrique", "hybride", "gpl"]);
const statut = z.enum(["actif", "en_maintenance", "hors_service", "vendu"]);
const typeEntretien = z.enum(["vidange", "pneus", "freins", "controle_technique", "revision", "reparation", "autre"]);
const typeAssurance = z.enum(["tiers", "tiers_plus", "tous_risques"]);

const createVehiculeSchema = z.object({
  immatriculation: z.string().min(1),
  marque: z.string().nullish(),
  modele: z.string().nullish(),
  annee: z.number().int().nullish(),
  typeCarburant: carburant.optional(),
  puissanceFiscale: z.number().int().nullish(),
  kilometrageActuel: z.number().int().min(0).optional(),
  dateAchat: z.string().nullish(),
  prixAchat: z.string().nullish(),
  technicienId: z.number().int().nullish(),
  statut: statut.optional(),
  notes: z.string().nullish(),
});

const entretienSchema = z.object({
  type: typeEntretien,
  dateEntretien: z.string(),
  kilometrageEntretien: z.number().int().nullish(),
  cout: z.string().nullish(),
  prestataire: z.string().nullish(),
  description: z.string().nullish(),
  prochainEntretienKm: z.number().int().nullish(),
  prochainEntretienDate: z.string().nullish(),
  facture: z.string().nullish(),
});

const assuranceSchema = z.object({
  compagnie: z.string().min(1),
  numeroContrat: z.string().nullish(),
  typeAssurance: typeAssurance.optional(),
  dateDebut: z.string(),
  dateFin: z.string(),
  primeAnnuelle: z.string().nullish(),
  franchise: z.string().nullish(),
  document: z.string().nullish(),
});

const idInput = z.object({ id: z.number().int() });
const vehiculeIdInput = z.object({ vehiculeId: z.number().int() });

// Routeur tRPC du domaine vehicules. Toutes les procédures sont protégées (tenant requis) ;
// les use-cases reçoivent ctx.tenant. Le repository est injecté (DI) → testable.
export function createVehiculesRouter(repo: IVehiculeRepository) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listVehicules(repo, ctx.tenant)),

    getById: protectedProcedure
      .input(idInput)
      .query(({ ctx, input }) => getVehiculeById(repo, ctx.tenant, input.id)),

    create: protectedProcedure
      .input(createVehiculeSchema)
      .mutation(({ ctx, input }) => createVehicule(repo, ctx.tenant, input)),

    update: protectedProcedure
      .input(z.object({ id: z.number().int(), data: createVehiculeSchema.partial() }))
      .mutation(({ ctx, input }) => updateVehicule(repo, ctx.tenant, input.id, input.data)),

    delete: protectedProcedure
      .input(idInput)
      .mutation(async ({ ctx, input }) => {
        await deleteVehicule(repo, ctx.tenant, input.id);
        return { success: true };
      }),

    updateKilometrage: protectedProcedure
      .input(z.object({ id: z.number().int(), kilometrage: z.number().int().min(0) }))
      .mutation(({ ctx, input }) => enregistrerKilometrage(repo, ctx.tenant, input.id, input.kilometrage)),

    addKilometrage: protectedProcedure
      .input(
        z.object({
          vehiculeId: z.number().int(),
          kilometrage: z.number().int().min(0),
          dateReleve: z.string(),
          motif: z.string().nullish(),
          technicienId: z.number().int().nullish(),
        }),
      )
      .mutation(({ ctx, input }) =>
        enregistrerReleveKilometrage(repo, ctx.tenant, input.vehiculeId, {
          kilometrage: input.kilometrage,
          dateReleve: input.dateReleve,
          motif: input.motif,
          technicienId: input.technicienId,
        }),
      ),

    getHistoriqueKilometrage: protectedProcedure
      .input(vehiculeIdInput)
      .query(({ ctx, input }) => repo.getHistoriqueKilometrage(ctx.tenant, input.vehiculeId)),

    getStatistiquesFlotte: protectedProcedure.query(({ ctx }) => repo.getStatistiquesFlotte(ctx.tenant)),

    getEntretiens: protectedProcedure
      .input(vehiculeIdInput)
      .query(({ ctx, input }) => repo.listEntretiens(ctx.tenant, input.vehiculeId)),

    addEntretien: protectedProcedure
      .input(z.object({ vehiculeId: z.number().int(), data: entretienSchema }))
      .mutation(({ ctx, input }) => ajouterEntretien(repo, ctx.tenant, input.vehiculeId, input.data)),

    getEntretiensAVenir: protectedProcedure.query(({ ctx }) => repo.listEntretiensAVenir(ctx.tenant)),

    getAssurances: protectedProcedure
      .input(vehiculeIdInput)
      .query(({ ctx, input }) => repo.listAssurances(ctx.tenant, input.vehiculeId)),

    addAssurance: protectedProcedure
      .input(z.object({ vehiculeId: z.number().int(), data: assuranceSchema }))
      .mutation(({ ctx, input }) => ajouterAssurance(repo, ctx.tenant, input.vehiculeId, input.data)),

    getAssurancesExpirant: protectedProcedure
      .input(z.object({ joursAvant: z.number().int().min(1).max(365).default(30) }).optional())
      .query(({ ctx, input }) => repo.listAssurancesExpirant(ctx.tenant, input?.joursAvant ?? 30)),
  });
}
