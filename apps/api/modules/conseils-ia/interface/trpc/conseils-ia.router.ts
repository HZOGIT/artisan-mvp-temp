import { protectedProcedure } from "../../../../interface/trpc/trpc";
import type { ConseilsIaDeps } from "../../application/use-cases";
import { getConseilsIA } from "../../application/use-cases";

// `conseilsIA` est appelé par le client comme une procédure RACINE (`trpc.conseilsIA.useQuery()`),
// pas comme un sous-routeur → on expose directement la procédure (montée sous la clé `conseilsIA`
// dans createAppRouter). Surface protégée (tenant requis). Dégradation silencieuse côté use-case.
export function createConseilsIaProcedure(deps: ConseilsIaDeps) {
  return protectedProcedure.query(({ ctx }) => getConseilsIA(deps, ctx.tenant!));
}
