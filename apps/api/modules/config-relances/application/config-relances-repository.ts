import type { TenantContext } from "../../../shared/tenant";
import type { ConfigRelancesAuto, UpdateConfigRelancesInput } from "../domain/config-relances";

/*
 * Port du repository config-relances (configuration relances auto, **singleton par tenant**). Chaque
 * méthode exige le TenantContext (scope tenant + RLS). `config_relances_auto.artisanId` est UNIQUE →
 * une seule ligne par artisan ; pas d'opération by-id, uniquement get/upsert.
 */
export interface IConfigRelancesRepository {
  // Renvoie la config du tenant ; **défauts (jamais null)** si la ligne est absente.
  get(ctx: TenantContext): Promise<ConfigRelancesAuto>;
  // Crée la ligne si absente, sinon met à jour les champs config fournis. Idempotent.
  upsert(ctx: TenantContext, input: UpdateConfigRelancesInput): Promise<ConfigRelancesAuto>;
}
