import { ConflictError, NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { ITransactionBancaireRepository } from "./transaction-bancaire-repository";
import type { IFactureLettrerPort, FactureImpayeeItem } from "./facture-lettreur-port";
import type { TransactionBancaire } from "../domain/transaction-bancaire";

/** Tolérance ±10 % sur le montant TTC pour la suggestion. */
const TOLERANCE_PCT = 0.10;

export interface SuggestionRapprochement extends FactureImpayeeItem {
  /** Score décroissant : montant exact (100pt) + bonus proximité date (≤30pt). */
  readonly score: number;
}

/**
 * Fonction PURE : score et filtre les factures candidates pour une transaction créditrice.
 * Seules les factures dont |ttc - montant| / max(ttc, montant) ≤ TOLERANCE_PCT sont gardées.
 * Tri décroissant par score (montant exact = +100, sinon +50 ; bonus date : max(0, 30 - jours)).
 */
export function scorerCandidats(
  montant: number,
  dateTransaction: string,
  factures: readonly FactureImpayeeItem[],
): SuggestionRapprochement[] {
  const dateTx = new Date(dateTransaction).getTime();
  const resultats: SuggestionRapprochement[] = [];
  for (const f of factures) {
    const ttc = Number(f.totalTTC) || 0;
    if (ttc <= 0) continue;
    const ratio = Math.abs(ttc - montant) / Math.max(ttc, montant);
    if (ratio > TOLERANCE_PCT) continue;
    const montantExact = Math.abs(ttc - montant) < 0.01;
    const jours = Math.abs(f.dateFacture.getTime() - dateTx) / 86_400_000;
    const score = (montantExact ? 100 : 50) + Math.max(0, 30 - jours);
    resultats.push({ ...f, score });
  }
  return resultats.sort((a, b) => b.score - a.score).slice(0, 5);
}

/** Retourne les crédits non rapprochés + suggestions pour chacun. */
export async function getSuggestionsRapprochement(
  deps: { transactionRepo: ITransactionBancaireRepository; lettreur: IFactureLettrerPort },
  ctx: TenantContext,
): Promise<Array<{ transaction: TransactionBancaire; suggestions: SuggestionRapprochement[] }>> {
  const [credits, impayees] = await Promise.all([
    deps.transactionRepo.listCreditsNonRapproches(ctx),
    deps.lettreur.listImpayees(ctx),
  ]);
  return credits.map((t) => ({
    transaction: t,
    suggestions: scorerCandidats(Number(t.montant), t.dateTransaction, impayees),
  }));
}

export interface RapprocherInput {
  readonly transactionId: number;
  readonly factureId: number;
}

/**
 * Rapproche un crédit bancaire à une facture :
 *  1. Vérifie que la transaction est un crédit non rapproché du tenant.
 *  2. Marque la facture payée (montantPaye = montant de la transaction, date = date de la transaction).
 *  3. Pose `transaction.facture_id` (idempotent : si déjà rapprochée à la même facture → no-op).
 */
export async function rapprocher(
  deps: { transactionRepo: ITransactionBancaireRepository; lettreur: IFactureLettrerPort },
  ctx: TenantContext,
  input: RapprocherInput,
): Promise<{ success: true }> {
  const t = await deps.transactionRepo.getById(ctx, input.transactionId);
  if (!t) throw new NotFoundError("Transaction introuvable");
  if (t.typeTransaction !== "credit") throw new ValidationError("Seule une transaction au crédit (encaissement) peut être rapprochée à une facture");
  /** Idempotent : si déjà rapprochée à la même facture → no-op. */
  if (t.factureId === input.factureId) return { success: true };
  if (t.factureId !== null) throw new ConflictError("Cette transaction est déjà rapprochée à une facture");

  const datePaiement = new Date(t.dateTransaction);
  await deps.lettreur.payer(ctx, input.factureId, t.montant, datePaiement);
  await deps.transactionRepo.lierFacture(ctx, input.transactionId, input.factureId);
  return { success: true };
}
