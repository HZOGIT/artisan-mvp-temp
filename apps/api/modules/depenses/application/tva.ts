/*
 * Calcul de la TVA d'une dépense — PUR, testable. ⚠️ Parité legacy `depensesRouter.create` :
 * `montantTva` et `montantTtc` sont **DÉRIVÉS** de `montantHt` + `tauxTva` côté serveur
 * (jamais acceptés du client) → pas de TTC falsifiable. Arrondi à 2 décimales (centimes).
 */

import { round2 } from "../../../shared/money";

export interface MontantsTva {
  readonly montantTva: string;
  readonly montantTtc: string;
}

/** TVA déductible retenue = montantTva × coeff/100, arrondie au centime. */
export function tvaDeduite(montantTva: string, coeff: string): string {
  return round2(Number(montantTva) * Number(coeff) / 100).toFixed(2);
}

export function calculerTva(montantHt: string, tauxTva: string): MontantsTva {
  const ht = Number(montantHt);
  const taux = Number(tauxTva);
  if (!Number.isFinite(ht) || !Number.isFinite(taux)) {
    throw new Error(`calculerTva: valeurs invalides (ht='${montantHt}', taux='${tauxTva}')`);
  }
  const tva = round2(ht * (taux / 100));
  const ttc = round2(ht + tva);
  return { montantTva: tva.toFixed(2), montantTtc: ttc.toFixed(2) };
}
