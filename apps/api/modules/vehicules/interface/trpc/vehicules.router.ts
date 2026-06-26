import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { DbClient } from "../../../../shared/db";
import { outboxEvent } from "../../../../shared/events/outbox-event";
import { withOutbox } from "../../../../shared/events/with-outbox";
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

/*
 * Routeur tRPC du domaine vehicules. Toutes les procédures sont protégées (tenant requis) ;
 * les use-cases reçoivent ctx.tenant. Le repository est injecté (DI) → testable.
 */
export function createVehiculesRouter(repo: IVehiculeRepository, db?: DbClient) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listVehicules(repo, ctx.tenant)),

    getById: protectedProcedure
      .input(idInput)
      .query(({ ctx, input }) => getVehiculeById(repo, ctx.tenant, input.id)),

    create: protectedProcedure
      .input(createVehiculeSchema)
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await createVehicule(r, ctx.tenant, input);
          ctx.log.info({ event: "vehicule_cree", vehiculeId: result.id, typeCarburant: input.typeCarburant ?? null }, "Véhicule ajouté à la flotte");
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "vehicule.cree", entityType: "vehicule", entityId: result.id, payload: { vehiculeId: result.id, immatriculation: result.immatriculation, marque: result.marque } });
          return result;
        });
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number().int(), data: createVehiculeSchema.partial() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await updateVehicule(r, ctx.tenant, input.id, input.data);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "vehicule.modifie", entityType: "vehicule", entityId: input.id, payload: { vehiculeId: input.id } });
          return result;
        });
      }),

    delete: protectedProcedure
      .input(idInput)
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const before = await r.getById(ctx.tenant, input.id);
          await deleteVehicule(r, ctx.tenant, input.id);
          ctx.log.warn({ event: "vehicule_supprime", vehiculeId: input.id }, "Véhicule retiré de la flotte");
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "vehicule.supprime", entityType: "vehicule", entityId: input.id, payload: { snapshot: { vehiculeId: input.id, immatriculation: before?.immatriculation } } });
          return { success: true };
        });
      }),

    updateKilometrage: protectedProcedure
      .input(z.object({ id: z.number().int(), kilometrage: z.number().int().min(0) }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await enregistrerKilometrage(r, ctx.tenant, input.id, input.kilometrage);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "vehicule.kilometrage_enregistre", entityType: "vehicule", entityId: input.id, payload: { vehiculeId: input.id, km: input.kilometrage } });
          return result;
        });
      }),

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
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await enregistrerReleveKilometrage(r, ctx.tenant, input.vehiculeId, {
            kilometrage: input.kilometrage,
            dateReleve: input.dateReleve,
            motif: input.motif,
            technicienId: input.technicienId,
          });
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "vehicule.releve_km_enregistre", entityType: "vehicule", entityId: input.vehiculeId, payload: { vehiculeId: input.vehiculeId, km: input.kilometrage, date: input.dateReleve } });
          return result;
        });
      }),

    getHistoriqueKilometrage: protectedProcedure
      .input(vehiculeIdInput)
      .query(({ ctx, input }) => repo.getHistoriqueKilometrage(ctx.tenant, input.vehiculeId)),

    getStatistiquesFlotte: protectedProcedure.query(({ ctx }) => repo.getStatistiquesFlotte(ctx.tenant)),

    getEntretiens: protectedProcedure
      .input(vehiculeIdInput)
      .query(({ ctx, input }) => repo.listEntretiens(ctx.tenant, input.vehiculeId)),

    addEntretien: protectedProcedure
      .input(z.object({ vehiculeId: z.number().int(), data: entretienSchema }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await ajouterEntretien(r, ctx.tenant, input.vehiculeId, input.data);
          ctx.log.info({ event: "vehicule_entretien_ajoute", vehiculeId: input.vehiculeId, type: input.data.type }, `Entretien véhicule enregistré : ${input.data.type}`);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "vehicule.entretien_ajoute", entityType: "vehicule", entityId: input.vehiculeId, payload: { vehiculeId: input.vehiculeId, entretienId: result.id, type: result.type } });
          return result;
        });
      }),

    getEntretiensAVenir: protectedProcedure.query(({ ctx }) => repo.listEntretiensAVenir(ctx.tenant)),

    getAssurances: protectedProcedure
      .input(vehiculeIdInput)
      .query(({ ctx, input }) => repo.listAssurances(ctx.tenant, input.vehiculeId)),

    addAssurance: protectedProcedure
      .input(z.object({ vehiculeId: z.number().int(), data: assuranceSchema }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await ajouterAssurance(r, ctx.tenant, input.vehiculeId, input.data);
          /** Assurance véhicule = conformité légale obligatoire — toute mise à jour doit être tracée. */
          ctx.log.info({ event: "vehicule_assurance_ajoutee", vehiculeId: input.vehiculeId, typeAssurance: input.data.typeAssurance ?? null, dateFin: input.data.dateFin }, "Assurance véhicule enregistrée");
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "vehicule.assurance_ajoutee", entityType: "vehicule", entityId: input.vehiculeId, payload: { vehiculeId: input.vehiculeId, assuranceId: result.id } });
          return result;
        });
      }),

    getAssurancesExpirant: protectedProcedure
      .input(z.object({ joursAvant: z.number().int().min(1).max(365).default(30) }).optional())
      .query(({ ctx, input }) => repo.listAssurancesExpirant(ctx.tenant, input?.joursAvant ?? 30)),
  });
}
