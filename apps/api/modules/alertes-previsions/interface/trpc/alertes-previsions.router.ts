import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IAlertesPrevisionsRepository } from "../../application/alertes-previsions-repository";
import { getConfig, saveConfig, getHistorique, verifierEtEnvoyer } from "../../application/use-cases";

/** Bornes alignées sur le legacy. `frequenceVerification` = enum fermé. Toutes optionnelles (upsert partiel). */
const saveConfigSchema = z.object({
  seuilAlertePositif: z.string().optional(),
  seuilAlerteNegatif: z.string().optional(),
  alerteEmail: z.boolean().optional(),
  alerteSms: z.boolean().optional(),
  emailDestination: z.string().optional(),
  telephoneDestination: z.string().optional(),
  frequenceVerification: z.enum(["quotidien", "hebdomadaire", "mensuel"]).optional(),
  actif: z.boolean().optional(),
});

/*
 * Routeur tRPC `alertesPrevisions` (alertes du prévisionnel de trésorerie). Transport mince : délègue
 * aux use-cases scopés `ctx.tenant` (RLS artisanId). `verifierEtEnvoyer` enregistre une alerte si
 * l'écart CA réalisé/prévisionnel du mois franchit un seuil (envoi réel = scheduler externe).
 */
export function createAlertesPrevisionsRouter(repo: IAlertesPrevisionsRepository) {
  return router({
    getConfig: protectedProcedure.query(({ ctx }) => getConfig(repo, ctx.tenant)),
    saveConfig: protectedProcedure.input(saveConfigSchema).mutation(({ ctx, input }) => saveConfig(repo, ctx.tenant, input)),
    getHistorique: protectedProcedure.query(({ ctx }) => getHistorique(repo, ctx.tenant)),
    verifierEtEnvoyer: protectedProcedure.mutation(({ ctx }) => verifierEtEnvoyer(repo, ctx.tenant)),
  });
}
