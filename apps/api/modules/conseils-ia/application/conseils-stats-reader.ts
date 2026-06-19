import type { TenantContext } from "../../../shared/tenant";
import type { ConseilsStats } from "../domain/conseils";

/*
 * Lecture des stats minimales (best-effort) servant à personnaliser le prompt des conseils IA.
 * Scopée tenant (RLS + filtre artisanId). Sémantique parité dashboard :
 * - devis en attente = statut ∈ {brouillon, envoye} ; factures impayées = statut ∉ {payee, annulee,
 *   brouillon} (count + somme totalTTC) ; stocks bas = quantiteEnStock ≤ seuilAlerte.
 */
export interface ConseilsStatsReader {
  getStats(ctx: TenantContext): Promise<ConseilsStats>;
}
