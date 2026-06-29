import type { TenantContext } from "../../../shared/tenant";
import type { DepenseAchatInput } from "../../ecritures/application/generation-use-cases";

/**
 * Seam comptable du module dépenses (symétrique au ComptaPort des factures). Découple la
 * génération des écritures AC de la logique métier dépenses. Implémenté par ecritures infra.
 */
export interface IDepenseComptaPort {
  /** Génère (idempotent) les écritures AC pour une dépense dans ecritures_comptables. */
  genererEcrituresAchat(ctx: TenantContext, depense: DepenseAchatInput): Promise<void>;
  /** Supprime les écritures AC liées à une dépense (identifiées par pieceRef=numero). */
  supprimerEcrituresAchat(ctx: TenantContext, depenseNumero: string): Promise<void>;
}
