import type { TenantContext } from "../../../shared/tenant";
import type { TransactionBancaire, ReleveItem, ImportReleveResult } from "../domain/transaction-bancaire";

/*
 * Port du repository des transactions bancaires (sous-ressource de `depenses`). Scopé tenant (RLS
 * `artisan_id` + filtre). Les écritures sensibles (conversion en dépense → FEC) sont portées par les
 * use-cases ; ici, lecture + marquage « ignorée » + import de relevé + lien dépense.
 */
export interface ITransactionBancaireRepository {
  /** Transactions NON ignorées du tenant (optionnellement d'un relevé), récentes d'abord, ≤500. */
  list(ctx: TenantContext, releveId?: number): Promise<TransactionBancaire[]>;
  /** null si la transaction n'appartient pas au tenant. */
  getById(ctx: TenantContext, id: number): Promise<TransactionBancaire | null>;
  /** Marque une transaction comme ignorée (scopé tenant ; no-op si hors tenant). Idempotent. */
  ignorer(ctx: TenantContext, id: number): Promise<void>;
  /*
   * Crée un relevé + insère ses transactions (montant stocké en valeur absolue), scopé tenant ;
   * met le relevé à `termine` avec le compte importé. `artisan_id` forcé.
   */
  createReleve(ctx: TenantContext, nomFichier: string, items: ReleveItem[]): Promise<ImportReleveResult>;
  /** Lie une transaction à une dépense (set `depense_id`), scopé tenant. No-op si hors tenant. */
  lierDepense(ctx: TenantContext, transactionId: number, depenseId: number): Promise<void>;
  /** Lie une transaction à une facture (lettrage — set `facture_id`), scopé tenant. Idempotent. */
  lierFacture(ctx: TenantContext, transactionId: number, factureId: number): Promise<void>;
  /** Crédits non rapprochés du tenant (facture_id IS NULL, ignoree=false), récents d'abord. */
  listCreditsNonRapproches(ctx: TenantContext): Promise<TransactionBancaire[]>;
}
