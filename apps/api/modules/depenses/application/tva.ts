/*
 * Calcul de la TVA d'une dépense — PUR, testable. ⚠️ Parité legacy `depensesRouter.create` :
 * `montantTva` et `montantTtc` sont **DÉRIVÉS** de `montantHt` + `tauxTva` côté serveur
 * (jamais acceptés du client) → pas de TTC falsifiable. Arrondi à 2 décimales (centimes).
 */

export interface MontantsTva {
  readonly montantTva: string;
  readonly montantTtc: string;
}

export function calculerTva(montantHt: string, tauxTva: string): MontantsTva {
  const ht = Number(montantHt) || 0;
  const taux = Number(tauxTva) || 0;
  // `+(ht * (taux/100)).toFixed(2)` (parité legacy) : TVA arrondie au centime.
  const tva = Number((ht * (taux / 100)).toFixed(2));
  const ttc = Number((ht + tva).toFixed(2));
  return { montantTva: tva.toFixed(2), montantTtc: ttc.toFixed(2) };
}
