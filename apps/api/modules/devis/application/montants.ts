import type { LigneType } from "../domain/devis";
import { round2 } from "../../../shared/money";

/*
 * Calcul des montants d'une ligne de devis — PUR, testable. ⚠️ Parité legacy (addLigne) :
 *  - une ligne `section`/`note` est une ligne d'affichage (titre de lot / texte libre) SANS
 *    prix → montants forcés à 0, **exclue des totaux** ;
 *  - sinon montantHT = round2(quantité × prixUnitaireHT) ; montantTVA = round2(montantHT × tauxTVA/100) ;
 *    montantTTC = round2(montantHT + montantTVA). round2 corrige les erreurs IEEE-754.
 */
export interface MontantsLigne {
  readonly montantHT: string;
  readonly montantTVA: string;
  readonly montantTTC: string;
}

export function calculerMontantsLigne(
  type: LigneType,
  quantite: string,
  prixUnitaireHT: string,
  tauxTVA: string,
): MontantsLigne {
  const isDisplay = type === "section" || type === "note";
  const q = isDisplay ? 0 : Number(quantite) || 0;
  const pu = isDisplay ? 0 : Number(prixUnitaireHT) || 0;
  const taux = isDisplay ? 0 : Number(tauxTVA) || 0;
  const ht = round2(q * pu);
  const tva = round2(ht * (taux / 100));
  return { montantHT: ht.toFixed(2), montantTVA: tva.toFixed(2), montantTTC: round2(ht + tva).toFixed(2) };
}

/*
 * Totaux d'un devis = somme des montants de ses lignes (les lignes d'affichage valent 0 →
 * neutres). Les totaux sont TOUJOURS dérivés des lignes côté serveur, jamais fournis par le
 * client (intégrité financière : totalTTC = totalHT + totalTVA).
 */
export interface TotauxDevis {
  readonly totalHT: string;
  readonly totalTVA: string;
  readonly totalTTC: string;
}

export function calculerTotaux(
  lignes: readonly { montantHT: string; montantTVA: string; montantTTC: string }[],
): TotauxDevis {
  let ht = 0;
  let tva = 0;
  let ttc = 0;
  for (const l of lignes) {
    ht += Number(l.montantHT) || 0;
    tva += Number(l.montantTVA) || 0;
    ttc += Number(l.montantTTC) || 0;
  }
  return { totalHT: round2(ht).toFixed(2), totalTVA: round2(tva).toFixed(2), totalTTC: round2(ttc).toFixed(2) };
}
