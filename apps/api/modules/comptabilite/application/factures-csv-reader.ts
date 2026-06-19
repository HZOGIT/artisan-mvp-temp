import type { TenantContext } from "../../../shared/tenant";
import type { FactureCsvRow } from "../domain/csv-export";
import type { Periode } from "./comptabilite-reader";

/** Lecture des factures (+ nom client) d'une période pour l'export CSV, scopée tenant (RLS). Lecture seule. */
export interface FacturesCsvReader {
  listFacturesPeriode(ctx: TenantContext, p: Periode): Promise<FactureCsvRow[]>;
}
