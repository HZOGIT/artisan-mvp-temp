import type { TenantContext } from "../../../shared/tenant";
import type { ParametresArtisan, UpdateParametresInput } from "../domain/parametres";

/*
 * Port du repository parametres (configuration artisan, **singleton par tenant**). Chaque méthode
 * exige le TenantContext (scope tenant + RLS). `parametres_artisan.artisanId` est UNIQUE → une seule
 * ligne par artisan ; pas d'opération by-id, uniquement get/upsert.
 */
export interface IParametresRepository {
  /*
   * Renvoie la config du tenant ; **défauts (jamais null)** si la ligne est absente (singleton
   * toujours lisible). Voir `defaultParametres`.
   */
  get(ctx: TenantContext): Promise<ParametresArtisan>;
  /*
   * Crée la ligne si absente, sinon met à jour les champs config fournis. ⚠️ NE touche JAMAIS aux
   * compteurs (inviolables via la config). Renvoie l'état résultant. Idempotent.
   */
  upsert(ctx: TenantContext, input: UpdateParametresInput): Promise<ParametresArtisan>;
}
