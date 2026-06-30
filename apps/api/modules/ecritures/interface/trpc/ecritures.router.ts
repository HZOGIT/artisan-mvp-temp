import { z } from "zod";
import { router, protectedProcedure, permissionProcedure } from "../../../../interface/trpc/trpc";
import type { IEcritureRepository } from "../../application/ecriture-repository";
import {
  listEcritures,
  listEcrituresFacture,
  balanceComptable,
  grandLivreComptable,
  genererExportFEC,
} from "../../application/read-use-cases";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (format AAAA-MM-JJ attendu)");

/*
 * Routeur tRPC du domaine ecritures (comptabilité/FEC) — **lecture seule** : aucune mutation,
 * la génération des écritures est un effet de bord du workflow facture (émission/paiement via le
 * ComptaPort). Transport mince : valide les inputs (zod), délègue aux use-cases (scoping tenant
 * via ctx.tenant). Repo injecté (DI).
 */
export function createEcrituresRouter(repo: IEcritureRepository) {
  const compta = permissionProcedure("comptabilite.voir");
  return router({
    list: protectedProcedure.query(({ ctx }) => listEcritures(repo, ctx.tenant)),

    byFacture: protectedProcedure
      .input(z.object({ factureId: z.number().int() }))
      .query(({ ctx, input }) => listEcrituresFacture(repo, ctx.tenant, input.factureId)),

    balance: compta.query(({ ctx }) => balanceComptable(repo, ctx.tenant)),

    grandLivre: compta
      .input(z.object({ numeroCompte: z.string().max(10).optional() }).optional())
      .query(({ ctx, input }) => grandLivreComptable(repo, ctx.tenant, input?.numeroCompte)),

    exportFec: compta
      .input(z.object({ debut: isoDate, fin: isoDate }))
      .query(({ ctx, input }) => genererExportFEC(repo, ctx.tenant, new Date(input.debut), new Date(input.fin))),
  });
}
