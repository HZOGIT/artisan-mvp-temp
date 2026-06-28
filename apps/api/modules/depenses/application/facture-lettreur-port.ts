import type { TenantContext } from "../../../shared/tenant";

/** Vue minimale d'une facture pour la suggestion de rapprochement. */
export interface FactureImpayeeItem {
  readonly id: number;
  readonly totalTTC: string;
  readonly dateFacture: Date;
  readonly numero: string | null;
  readonly nomClient: string;
}

/**
 * Seam cross-domaine : accès en lecture aux factures impayées + action de paiement.
 * Implémenté dans app.ts via `marquerFacturePayee` (factures/write-use-cases) — le domaine
 * depenses ne dépend pas directement du module factures.
 */
export interface IFactureLettrerPort {
  /** Factures `envoyee|en_retard` du tenant (≤500), avec nom du client. */
  listImpayees(ctx: TenantContext): Promise<FactureImpayeeItem[]>;
  /**
   * Marque la facture payée (sémantique legacy — écrase montantPaye, force statut=payee).
   * Génère les écritures FEC (vente + encaissement) via ComptaPort. Best-effort FEC.
   * No-op si déjà payée (idempotent depuis le use-case marquerFacturePayee).
   */
  payer(ctx: TenantContext, factureId: number, montantPaye: string, datePaiement: Date): Promise<void>;
}
