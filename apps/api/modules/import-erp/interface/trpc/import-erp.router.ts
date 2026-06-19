import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IImportErpRepository } from "../../application/import-erp-repository";
import { importClients, importDevis, importFactures } from "../../application/use-cases";

/** Bornes alignées sur le legacy : ≤ 5000 lignes/lot, mapping {colonne → champ}. */
const importSchema = z.object({
  rows: z.array(z.record(z.string(), z.any())).max(5000),
  mapping: z.record(z.string(), z.string()),
});

/*
 * Routeur tRPC `importErp` (import de reprise de données depuis un ERP). Transport mince : délègue aux
 * use-cases scopés `ctx.tenant` (RLS artisanId). 3 imports « légers » par lot : clients / devis /
 * factures (montant TTC brut, sans lignes — reprise, pas d'émission).
 */
export function createImportErpRouter(repo: IImportErpRepository) {
  return router({
    importClients: protectedProcedure.input(importSchema).mutation(({ ctx, input }) => importClients(repo, ctx.tenant, input)),
    importDevis: protectedProcedure.input(importSchema).mutation(({ ctx, input }) => importDevis(repo, ctx.tenant, input)),
    importFactures: protectedProcedure.input(importSchema).mutation(({ ctx, input }) => importFactures(repo, ctx.tenant, input)),
  });
}
