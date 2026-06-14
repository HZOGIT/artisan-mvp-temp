import type { TenantContext } from "../../../shared/tenant";
import type { IParametresRepository } from "./parametres-repository";
import type { ParametresArtisan } from "../domain/parametres";

// Use-case de lecture — pur, repository injecté. Singleton par tenant : `getParametres` renvoie
// TOUJOURS une configuration (les défauts si la ligne n'existe pas encore) — pas de NotFound.
export function getParametres(repo: IParametresRepository, ctx: TenantContext): Promise<ParametresArtisan> {
  return repo.get(ctx);
}
