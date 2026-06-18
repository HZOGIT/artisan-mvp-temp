import type { TenantContext } from "../../../shared/tenant";
import type { DevisStatRow } from "../domain/devis-stats";

// Port de lecture pour les statistiques devis : renvoie les lignes (statut + TTC) du tenant courant.
// Scoping tenant garanti par l'implémentation (RLS + filtre `artisanId`).
export interface IDevisStatsReader {
  getDevisForStats(ctx: TenantContext): Promise<DevisStatRow[]>;
}
