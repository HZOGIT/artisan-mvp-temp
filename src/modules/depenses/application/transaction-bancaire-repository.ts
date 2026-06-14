import type { TenantContext } from "../../../shared/tenant";
import type { TransactionBancaire } from "../domain/transaction-bancaire";

// Port du repository des transactions bancaires (sous-ressource de `depenses`). Scopé tenant (RLS
// `artisan_id` + filtre). Les écritures sensibles (conversion en dépense → FEC) sont portées par les
// use-cases ; ici, lecture + marquage « ignorée ».
export interface ITransactionBancaireRepository {
  // Transactions NON ignorées du tenant (optionnellement d'un relevé), récentes d'abord, ≤500.
  list(ctx: TenantContext, releveId?: number): Promise<TransactionBancaire[]>;
  // Marque une transaction comme ignorée (scopé tenant ; no-op si hors tenant). Idempotent.
  ignorer(ctx: TenantContext, id: number): Promise<void>;
}
