import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../../../../interface/trpc/trpc";
import type { ConseilsIaDeps } from "../../application/use-cases";
import { getConseilsIA } from "../../application/use-cases";
import { assertPlanModule } from "../../../feature-modules/application/use-cases";
import type { AppLogger } from "../../../../shared/ports/logger";

/*
 * `conseilsIA` est appelé par le client comme une procédure RACINE (`trpc.conseilsIA.useQuery()`),
 * pas comme un sous-routeur → on expose directement la procédure (montée sous la clé `conseilsIA`
 * dans createAppRouter). Surface protégée (tenant requis). Dégradation silencieuse côté use-case.
 */
export function createConseilsIaProcedure(deps: ConseilsIaDeps) {
  return protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.tenant) throw new TRPCError({ code: "UNAUTHORIZED" });
    await assertPlanModule(deps.subscriptionReader, deps.modulesRepo, ctx.tenant, "assistant_ia");
    return getConseilsIA(deps, ctx.tenant, ctx.log as unknown as AppLogger);
  });
}
