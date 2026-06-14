import { z } from "zod";
import { router, permissionProcedure } from "../../../../interface/trpc/trpc";
import type { IComptabiliteReader } from "../../application/comptabilite-reader";
import * as uc from "../../application/use-cases";

// Toutes les procédures sont gardées par `comptabilite.voir` (admin bypasse), parité legacy
// `comptaVoirProcedure`. Lectures seules (FEC/TVA/grand-livre/balance/journal). Période par défaut = mois courant.
const gate = permissionProcedure("comptabilite.voir");
const rangeInput = z.object({ dateDebut: z.date().optional(), dateFin: z.date().optional() }).optional();

export function createComptabiliteRouter(reader: IComptabiliteReader) {
  return router({
    getGrandLivre: gate.input(rangeInput).query(({ ctx, input }) => uc.getGrandLivre(reader, ctx.tenant, input)),
    getBalance: gate.input(rangeInput).query(({ ctx, input }) => uc.getBalance(reader, ctx.tenant, input)),
    getJournalVentes: gate.input(rangeInput).query(({ ctx, input }) => uc.getJournalVentes(reader, ctx.tenant, input)),
    getRapportTVA: gate.input(rangeInput).query(({ ctx, input }) => uc.getRapportTVA(reader, ctx.tenant, input)),
    getDeclarationTVADetail: gate.input(rangeInput).query(({ ctx, input }) => uc.getDeclarationTVADetail(reader, ctx.tenant, input)),
  });
}
