import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IIntegrationsComptablesRepository } from "../../application/integrations-comptables-repository";
import type { TenantContext } from "../../../../shared/tenant";
import { getConfig, saveConfig, saveSyncConfig, getSyncStatus, getExports, genererExport, getSyncLogs, getPendingItems, lancerSync, retrySync } from "../../application/use-cases";

const logicielEnum = z.enum(["sage", "quickbooks", "ciel", "ebp", "autre"]);
const formatEnum = z.enum(["fec", "iif", "qbo", "csv"]);

const saveConfigSchema = z.object({
  logiciel: logicielEnum.optional(), formatExport: formatEnum.optional(),
  compteVentes: z.string().optional(), compteTVACollectee: z.string().optional(), compteClients: z.string().optional(),
  compteAchats: z.string().optional(), compteTVADeductible: z.string().optional(), compteFournisseurs: z.string().optional(),
  compteBanque: z.string().optional(), compteCaisse: z.string().optional(),
  journalVentes: z.string().optional(), journalAchats: z.string().optional(), journalBanque: z.string().optional(),
  prefixeFacture: z.string().optional(), prefixeAvoir: z.string().optional(), exerciceDebut: z.number().optional(), actif: z.boolean().optional(),
  regimeTVA: z.enum(["encaissements", "debits"]).optional(),
});

const saveSyncConfigSchema = z.object({
  syncAutoFactures: z.boolean().optional(), syncAutoPaiements: z.boolean().optional(),
  frequenceSync: z.enum(["quotidien", "hebdomadaire", "mensuel", "manuel"]).optional(),
  heureSync: z.string().optional(), notifierErreurs: z.boolean().optional(), notifierSucces: z.boolean().optional(),
});

/*
 * Routeur tRPC `integrationsComptables` (exports/sync vers logiciels comptables tiers). Tous protégés.
 * ⚠️ Lecture seule des données financières (FEC réutilisé, aucune écriture mutée). Repo injecté + un
 * fournisseur de contenu FEC (`fec`) branché sur le générateur du domaine comptabilité.
 */
export function createIntegrationsComptablesRouter(repo: IIntegrationsComptablesRepository, fec: { getFecContent(ctx: TenantContext, period: { dateDebut: Date; dateFin: Date }): Promise<string> }) {
  return router({
    getConfig: protectedProcedure.query(({ ctx }) => getConfig(repo, ctx.tenant)),
    saveConfig: protectedProcedure.input(saveConfigSchema).mutation(({ ctx, input }) => saveConfig(repo, ctx.tenant, input)),
    saveSyncConfig: protectedProcedure.input(saveSyncConfigSchema).mutation(({ ctx, input }) => saveSyncConfig(repo, ctx.tenant, input)),
    getSyncStatus: protectedProcedure.query(({ ctx }) => getSyncStatus(repo, ctx.tenant)),
    getExports: protectedProcedure.query(({ ctx }) => getExports(repo, ctx.tenant)),
    genererExport: protectedProcedure
      .input(z.object({ logiciel: logicielEnum, formatExport: formatEnum, dateDebut: z.string(), dateFin: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const result = await genererExport({ repo, fec }, ctx.tenant, input);
        /** FEC = document légal obligatoire (contrôle fiscal) — toute génération doit être tracée. */
        ctx.log.warn({ event: "comptabilite_export_genere", logiciel: input.logiciel, format: input.formatExport, dateDebut: input.dateDebut, dateFin: input.dateFin }, "Export comptable généré");
        return result;
      }),
    getSyncLogs: protectedProcedure.query(({ ctx }) => getSyncLogs(repo, ctx.tenant)),
    getPendingItems: protectedProcedure.query(({ ctx }) => getPendingItems(repo, ctx.tenant)),
    lancerSync: protectedProcedure.mutation(async ({ ctx }) => {
      const result = await lancerSync(repo, ctx.tenant);
      ctx.log.info({ event: "comptabilite_sync_lancee" }, "Sync comptable déclenchée manuellement");
      return result;
    }),
    retrySync: protectedProcedure.input(z.object({ type: z.enum(["facture", "paiement"]), id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const result = await retrySync(repo, ctx.tenant, input.id);
      ctx.log.info({ event: "comptabilite_sync_retry", type: input.type, id: input.id }, "Retry sync comptable");
      return result;
    }),
  });
}
