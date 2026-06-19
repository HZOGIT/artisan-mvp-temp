import type { TenantContext } from "../../../shared/tenant";
import type { CAParMois } from "../domain/prevision-ca";

/*
 * Port (cross-domaine) : agrège le CA réalisé du tenant à partir des **factures PAYÉES**, groupé par
 * mois/année. Lecture seule, scopée tenant (RLS sur `factures.artisanId`). Sert au recalcul de
 * l'historique de CA par `calculer`. Le module previsions n'accède PAS directement à la table
 * factures : il dépend de cette interface (clean-archi).
 */
export interface FacturesCAReader {
  aggregatePaidByMonth(ctx: TenantContext): Promise<CAParMois[]>;
}
