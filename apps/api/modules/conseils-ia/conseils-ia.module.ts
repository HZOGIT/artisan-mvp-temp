import type { ConseilsIaDeps } from "./application/use-cases";
import { createConseilsIaProcedure } from "./interface/trpc/conseils-ia.router";

// Wiring DI du module conseils IA. ⚠️ `conseilsIA` est une procédure RACINE (pas un sous-routeur) :
// le module expose `procedure`, montée sous la clé `conseilsIA` dans createAppRouter.
export interface ConseilsIaModule {
  readonly deps: ConseilsIaDeps;
  readonly procedure: ReturnType<typeof createConseilsIaProcedure>;
}

export function createConseilsIaModule(deps: ConseilsIaDeps): ConseilsIaModule {
  return { deps, procedure: createConseilsIaProcedure(deps) };
}
