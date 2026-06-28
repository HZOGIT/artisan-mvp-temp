import { NotFoundError, ValidationError, ConflictError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IContratRepository } from "./contrat-repository";
import type { ReviserPrixResult } from "../domain/contrat";
import { round2 } from "../../../shared/money";

/** Calcule le nouveau montant HT après indexation (arrondi monétaire). PUR, testable. */
export function calculerNouveauMontant(montantHT: string, tauxPourcent: string): string {
  const montant = parseFloat(montantHT);
  const taux = parseFloat(tauxPourcent);
  return round2(montant * (1 + taux / 100)).toFixed(2);
}

/**
 * Révise le prix d'un contrat selon son taux d'indexation annuel.
 * Idempotent : refuse une 2e révision dans la même année calendaire.
 */
export async function reviserPrixContrat(repo: IContratRepository, ctx: TenantContext, id: number): Promise<ReviserPrixResult> {
  const contrat = await repo.getById(ctx, id);
  if (!contrat) throw new NotFoundError("Contrat introuvable");

  if (!contrat.tauxIndexationAnnuel || parseFloat(contrat.tauxIndexationAnnuel) <= 0) {
    throw new ValidationError("Aucun taux d'indexation annuel défini sur ce contrat");
  }

  const ancienMontantHT = contrat.montantHT;
  const nouveauMontantHT = calculerNouveauMontant(contrat.montantHT, contrat.tauxIndexationAnnuel);
  const updated = await repo.reviserPrix(ctx, id, nouveauMontantHT, new Date());
  /*
   * `null` signifie 0 lignes mises à jour : la garde SQL a rejeté la requête
   * (dateDerniereRevision déjà dans l'année courante) — conflit de concurrence.
   */
  if (!updated) throw new ConflictError("Le prix de ce contrat a déjà été révisé cette année");

  return { contrat: updated, ancienMontantHT, nouveauMontantHT };
}
