import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../../../../interface/trpc/trpc";
import type { ConseilsIaDeps } from "../../application/use-cases";
import { getConseilsIA } from "../../application/use-cases";
import type { AppLogger } from "../../../../shared/ports/logger";

/*
 * `conseilsIA` est appelé par le client comme une procédure RACINE (`trpc.conseilsIA.useQuery()`),
 * pas comme un sous-routeur → on expose directement la procédure (montée sous la clé `conseilsIA`
 * dans createAppRouter). Surface protégée (tenant requis). Dégradation silencieuse côté use-case.
 */
export function createConseilsIaProcedure(deps: ConseilsIaDeps) {
  return protectedProcedure.query(({ ctx }) => {
    if (!ctx.tenant) throw new TRPCError({ code: "UNAUTHORIZED" });
    return getConseilsIA(deps, ctx.tenant, ctx.log as unknown as AppLogger);
  });
}
