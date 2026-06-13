import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IClientRepository } from "../../application/client-repository";
import {
  listClients,
  getClient,
  rechercherClients,
  getEncoursClient,
  getEncoursMap,
} from "../../application/read-use-cases";
import { creerClient, modifierClient, supprimerClient } from "../../application/write-use-cases";

// Bornes alignées sur `ClientInputSchema` (shared/validation.ts) — defense-in-depth côté
// transport. Le format e-mail (et le « nom requis ») sont aussi validés au use-case
// (indépendant du transport) ; ici on borne surtout les longueurs colonnes PG.
const createSchema = z.object({
  nom: z.string().min(1).max(100),
  prenom: z.string().max(100).nullish(),
  email: z.string().max(320).nullish(),
  telephone: z.string().max(20).nullish(),
  adresse: z.string().max(255).nullish(),
  codePostal: z.string().max(10).nullish(),
  ville: z.string().max(100).nullish(),
  adresseFacturation: z.string().max(255).nullish(),
  codePostalFacturation: z.string().max(10).nullish(),
  villeFacturation: z.string().max(100).nullish(),
  type: z.enum(["particulier", "professionnel"]).optional(),
  raisonSociale: z.string().max(255).nullish(),
  siret: z.string().max(14).nullish(),
  numeroTVA: z.string().max(20).nullish(),
  etiquettes: z.string().max(500).nullish(),
  notes: z.string().nullish(),
});

// Mise à jour partielle : tous les champs optionnels ; `nom` s'il est fourni reste non vide.
const updateSchema = z.object({
  nom: z.string().min(1).max(100).optional(),
  prenom: z.string().max(100).nullish(),
  email: z.string().max(320).nullish(),
  telephone: z.string().max(20).nullish(),
  adresse: z.string().max(255).nullish(),
  codePostal: z.string().max(10).nullish(),
  ville: z.string().max(100).nullish(),
  adresseFacturation: z.string().max(255).nullish(),
  codePostalFacturation: z.string().max(10).nullish(),
  villeFacturation: z.string().max(100).nullish(),
  type: z.enum(["particulier", "professionnel"]).optional(),
  raisonSociale: z.string().max(255).nullish(),
  siret: z.string().max(14).nullish(),
  numeroTVA: z.string().max(20).nullish(),
  etiquettes: z.string().max(500).nullish(),
  notes: z.string().nullish(),
});

// Routeur tRPC du domaine clients (CRM/PII). Transport mince : valide les inputs (zod),
// délègue aux use-cases (scoping tenant via ctx.tenant), laisse remonter les Domain errors
// (NotFound→404, Validation→400, Conflict→409 pour une suppression refusée). Repo injecté (DI).
export function createClientsRouter(repo: IClientRepository) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listClients(repo, ctx.tenant)),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getClient(repo, ctx.tenant, input.id)),

    search: protectedProcedure
      .input(z.object({ query: z.string().min(1).max(100) }))
      .query(({ ctx, input }) => rechercherClients(repo, ctx.tenant, input.query)),

    // Encours financier (reste dû des factures impayées). Lecture seule, scopée tenant.
    getEncours: protectedProcedure
      .input(z.object({ clientId: z.number().int() }))
      .query(({ ctx, input }) => getEncoursClient(repo, ctx.tenant, input.clientId)),

    getEncoursMap: protectedProcedure.query(({ ctx }) => getEncoursMap(repo, ctx.tenant)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(({ ctx, input }) => creerClient(repo, ctx.tenant, input)),

    update: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return modifierClient(repo, ctx.tenant, id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerClient(repo, ctx.tenant, input.id);
        return { success: true };
      }),
  });
}
