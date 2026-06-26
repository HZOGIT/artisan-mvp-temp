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

export function calculerTva(montantHt: string, tauxTva: string): MontantsTva {
  const ht = Number(montantHt) || 0;
  const taux = Number(tauxTva) || 0;
  const tva = round2(ht * (taux / 100));
  const ttc = round2(ht + tva);
  return { montantTva: tva.toFixed(2), montantTtc: ttc.toFixed(2) };
}
