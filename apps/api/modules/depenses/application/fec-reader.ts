import type { TenantContext } from "../../../shared/tenant";
import type { FecDepense, ConfigComptable } from "../domain/fec";

// Port (lecture seule) pour l'export FEC : dépenses déductibles d'une période + config comptable du
// tenant. Scopé tenant (RLS `artisan_id` / `artisanId`). La génération du fichier est PURE (use-case).
export interface FecReader {
  // Dépenses `tva_deductible = true` dont `date_depense ∈ [dateDebut, dateFin]`, triées date puis id.
  listDepensesDeductibles(ctx: TenantContext, dateDebut: string, dateFin: string): Promise<FecDepense[]>;
  // Config comptable du tenant (comptes + journal), avec défauts PCG si absente.
  getConfigComptable(ctx: TenantContext): Promise<ConfigComptable>;
}
