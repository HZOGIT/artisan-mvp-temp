import { z } from "zod";
import { router, permissionProcedure } from "../../../../interface/trpc/trpc";
import type { IRapportRepository } from "../../application/rapport-repository";
import { basculerFavori, creerRapport, executerRapport, listRapports, supprimerRapport } from "../../application/use-cases";

/** Bornes alignées sur les colonnes `rapports_personnalises` (parité legacy `rapports.create`). */
const createSchema = z.object({
  nom: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  type: z.enum(["ventes", "clients", "interventions", "stocks", "fournisseurs", "techniciens", "financier"]),
  filtres: z.record(z.string(), z.unknown()).optional(),
  colonnes: z.array(z.string().max(100)).max(100).optional(),
  groupement: z.string().max(50).optional(),
  tri: z.string().max(50).optional(),
  format: z.enum(["tableau", "graphique", "liste"]).optional(),
  graphiqueType: z.enum(["bar", "line", "pie", "doughnut"]).optional(),
});

const statsProcedure = permissionProcedure("statistiques.voir");

/** Routeur tRPC des rapports personnalisables. Surface client : list/create/delete/toggleFavori/executer. */
export function createRapportsRouter(repo: IRapportRepository) {
  return router({
    list: statsProcedure.query(({ ctx }) => listRapports(repo, ctx.tenant)),

    create: statsProcedure.input(createSchema).mutation(({ ctx, input }) => creerRapport(repo, ctx.tenant, input)),

    delete: statsProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(({ ctx, input }) => supprimerRapport(repo, ctx.tenant, input.id)),

    toggleFavori: statsProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(({ ctx, input }) => basculerFavori(repo, ctx.tenant, input.id)),

    executer: statsProcedure
      .input(z.object({ rapportId: z.number().int(), parametres: z.record(z.string(), z.unknown()).optional() }))
      .query(({ ctx, input }) => executerRapport(repo, ctx.tenant, input.rapportId, input.parametres)),
  });
}
