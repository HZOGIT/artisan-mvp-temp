import type { LigneType } from "../domain/devis";

// Calcul des montants d'une ligne de devis — PUR, testable. ⚠️ Parité legacy (addLigne) :
//  - une ligne `section`/`note` est une ligne d'affichage (titre de lot / texte libre) SANS
//    prix → montants forcés à 0, **exclue des totaux** ;
//  - sinon montantHT = quantité × prixUnitaireHT ; montantTVA = montantHT × tauxTVA/100 ;
//    montantTTC = montantHT + montantTVA. Arrondi au centime.
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
  const ht = q * pu;
  const tva = ht * (taux / 100);
  return { montantHT: ht.toFixed(2), montantTVA: tva.toFixed(2), montantTTC: (ht + tva).toFixed(2) };
}

// Totaux d'un devis = somme des montants de ses lignes (les lignes d'affichage valent 0 →
// neutres). Les totaux sont TOUJOURS dérivés des lignes côté serveur, jamais fournis par le
// client (intégrité financière : totalTTC = totalHT + totalTVA).
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
  return { totalHT: ht.toFixed(2), totalTVA: tva.toFixed(2), totalTTC: ttc.toFixed(2) };
}
