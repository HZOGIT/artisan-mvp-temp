import type { LigneType } from "../domain/facture";

// Calcul des montants d'une ligne de facture — PUR, testable. ⚠️ Parité legacy :
//  - une ligne `section`/`note` est une ligne d'affichage (titre de lot / texte libre) SANS
//    prix → montants forcés à 0, **exclue des totaux** ;
//  - sinon montantHT = quantité × prixUnitaireHT ; montantTVA = montantHT × tauxTVA/100 ;
//    montantTTC = montantHT + montantTVA. Arrondi au centime.
// NB : copie volontaire du helper devis (isolation des modules — pas de couplage inter-domaine).
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

// Totaux d'une facture = somme des montants de ses lignes (les lignes d'affichage valent 0 →
// neutres). Les totaux sont TOUJOURS dérivés des lignes côté serveur, jamais fournis par le
// client (intégrité financière : totalTTC = totalHT + totalTVA).
export interface TotauxFacture {
  readonly totalHT: string;
  readonly totalTVA: string;
  readonly totalTTC: string;
}

// Montants d'une ligne d'AVOIR (note de crédit) — montants **négatifs** (parité legacy
// `createAvoir`). Le `prixUnitaireHT` est stocké négatif (−|pu|), la quantité reste positive.
export interface MontantsAvoirLigne extends MontantsLigne {
  readonly prixUnitaireHT: string; // négatif
}

export function calculerMontantsAvoirLigne(quantite: string, prixUnitaireHT: string, tauxTVA: string): MontantsAvoirLigne {
  const q = Math.abs(Number(quantite) || 0);
  const pu = Math.abs(Number(prixUnitaireHT) || 0);
  const taux = Number(tauxTVA) || 0;
  const ht = -(q * pu);
  const tva = ht * (taux / 100);
  return {
    prixUnitaireHT: (-pu).toFixed(2),
    montantHT: ht.toFixed(2),
    montantTVA: tva.toFixed(2),
    montantTTC: (ht + tva).toFixed(2),
  };
}

export function calculerTotaux(
  lignes: readonly { montantHT: string; montantTVA: string; montantTTC: string }[],
): TotauxFacture {
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
