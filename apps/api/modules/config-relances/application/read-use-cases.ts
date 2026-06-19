import type { TenantContext } from "../../../shared/tenant";
import type { IConfigRelancesRepository } from "./config-relances-repository";
import type { ConfigRelancesAuto } from "../domain/config-relances";

/*
 * Use-case de lecture — pur, repository injecté. Singleton par tenant : `getConfigRelances` renvoie
 * TOUJOURS une configuration (les défauts si la ligne n'existe pas encore) — pas de NotFound.
 */
export function getConfigRelances(repo: IConfigRelancesRepository, ctx: TenantContext): Promise<ConfigRelancesAuto> {
  return repo.get(ctx);
}
