import { dailyKey } from "../../../platform/scheduler/scheduler-types";
import type { JobDefinition } from "../../../platform/scheduler/scheduler-types";
import { envoyerRelancesAutomatiques, type DevisRelanceDeps } from "./relances-devis";
import type { TenantContext } from "../../../shared/tenant";

export interface RelancesDevisJobDeps {
  /** Renvoie les artisanIds dont les relances automatiques sont actives (actif = true). */
  readonly listArtiasnsActifs: () => Promise<number[]>;
  /** Construit les dépendances de relance pour l'artisan donné (repos + email scopés). */
  readonly makeRelanceDeps: (artisanId: number) => DevisRelanceDeps;
}

/**
 * Job idempotent de relances de devis — clé daily (un seul tick par jour par le scheduler).
 * Pour chaque artisan actif, délègue à {@link envoyerRelancesAutomatiques} qui gère le throttle
 * par devis ({@link DevisRelanceDeps.joursEntreRelances}). Erreurs par artisan silencieuses
 * (best-effort) — un artisan en échec ne bloque pas les suivants.
 */
export function createRelancesDevisJob(deps: RelancesDevisJobDeps): JobDefinition {
  return {
    name: "relances-devis",
    periodKey: dailyKey,
    async run() {
      const artisanIds = await deps.listArtiasnsActifs();
      for (const artisanId of artisanIds) {
        const ctx: TenantContext = { artisanId, userId: 0 };
        await envoyerRelancesAutomatiques(deps.makeRelanceDeps(artisanId), ctx).catch(() => {});
      }
    },
  };
}
