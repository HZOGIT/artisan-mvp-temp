import type { TenantContext } from "../../../shared/tenant";
import type { TresorerieData } from "../domain/prevision-ca";

/*
 * Port (cross-domaine) : charge les données brutes de trésorerie du tenant — créances (factures non
 * soldées envoyée/en_retard), avoirs (crédits client), dépenses récurrentes — scopées tenant (RLS).
 * Le module previsions n'accède PAS directement aux tables factures/depenses : il dépend de cette
 * interface (clean-archi). Lecture seule.
 */
export interface TresorerieReader {
  load(ctx: TenantContext): Promise<TresorerieData>;
}
