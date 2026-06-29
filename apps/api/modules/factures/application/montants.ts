import type { LigneType } from "../domain/facture";
import { round2 } from "../../../shared/money";

/*
 * Calcul des montants d'une ligne de facture — PUR, testable. ⚠️ Parité legacy :
 *  - une ligne `section`/`note` est une ligne d'affichage (titre de lot / texte libre) SANS
 *    prix → montants forcés à 0, **exclue des totaux** ;
 *  - sinon montantHT = round2(quantité × prixUnitaireHT) ; montantTVA = round2(montantHT × tauxTVA/100) ;
 *    montantTTC = round2(montantHT + montantTVA). round2 corrige les erreurs IEEE-754.
 * NB : copie volontaire du helper devis (isolation des modules — pas de couplage inter-domaine).
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
  remise = "0",
): MontantsLigne {
  const isDisplay = type === "section" || type === "note";
  const q = isDisplay ? 0 : Number(quantite) || 0;
  const pu = isDisplay ? 0 : Number(prixUnitaireHT) || 0;
  const taux = isDisplay ? 0 : Number(tauxTVA) || 0;
  const r = isDisplay ? 0 : Math.min(100, Math.max(0, Number(remise) || 0));
  const ht = round2(q * pu * (1 - r / 100));
  const tva = round2(ht * (taux / 100));
  return { montantHT: ht.toFixed(2), montantTVA: tva.toFixed(2), montantTTC: round2(ht + tva).toFixed(2) };
}

export interface LotSousTotal {
  readonly sectionLabel: string;
  readonly totalHT: string;
  readonly totalTVA: string;
  readonly totalTTC: string;
}

/**
 * Sous-totaux par lot : pour chaque lot précédé d'une `section` et contenant ≥1 article,
 * renvoie Map(index → LotSousTotal) où l'entrée s'insère APRÈS lignes[index].
 * Les lots avant la première section et les lots vides sont ignorés.
 */
export function calculerSousTotauxParSection(
  lignes: readonly { type: LigneType; designation?: string | null; montantHT: string; montantTVA: string; montantTTC: string }[],
): Map<number, LotSousTotal> {
  const result = new Map<number, LotSousTotal>();
  let section: string | null = null;
  let ht = 0, tva = 0, ttc = 0;
  let hasArticles = false;

  const flush = (idx: number) => {
    if (section !== null && hasArticles) {
      result.set(idx, { sectionLabel: section, totalHT: round2(ht).toFixed(2), totalTVA: round2(tva).toFixed(2), totalTTC: round2(ttc).toFixed(2) });
    }
  };

  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i];
    if (l.type === "section") {
      flush(i - 1);
      section = l.designation ?? "";
      ht = tva = ttc = 0;
      hasArticles = false;
    } else if (l.type !== "note") {
      if (section !== null) {
        ht += Number(l.montantHT) || 0;
        tva += Number(l.montantTVA) || 0;
        ttc += Number(l.montantTTC) || 0;
        hasArticles = true;
      }
    }
  }
  flush(lignes.length - 1);
  return result;
}

/*
 * Totaux d'une facture = somme des montants de ses lignes (les lignes d'affichage valent 0 →
 * neutres). Les totaux sont TOUJOURS dérivés des lignes côté serveur, jamais fournis par le
 * client (intégrité financière : totalTTC = totalHT + totalTVA).
 */
export interface TotauxFacture {
  readonly totalHT: string;
  readonly totalTVA: string;
  readonly totalTTC: string;
}

/*
 * Montants d'une ligne d'AVOIR (note de crédit) — montants **négatifs** (parité legacy
 * `createAvoir`). Le `prixUnitaireHT` est stocké négatif (−|pu|), la quantité reste positive.
 */
export interface MontantsAvoirLigne extends MontantsLigne {
  /** négatif */
  readonly prixUnitaireHT: string;
}

export function calculerMontantsAvoirLigne(quantite: string, prixUnitaireHT: string, tauxTVA: string, remise = "0"): MontantsAvoirLigne {
  const q = Math.abs(Number(quantite) || 0);
  const pu = Math.abs(Number(prixUnitaireHT) || 0);
  const taux = Number(tauxTVA) || 0;
  const r = Math.min(100, Math.max(0, Number(remise) || 0));
  const ht = -round2(q * pu * (1 - r / 100));
  const tva = round2(ht * (taux / 100));
  return {
    prixUnitaireHT: (-pu).toFixed(2),
    montantHT: ht.toFixed(2),
    montantTVA: tva.toFixed(2),
    montantTTC: round2(ht + tva).toFixed(2),
  };
}

/**
 * Si `regimeTVA` est `autoliquidation_btp` ou `exonere`, force totalTVA=0 et totalTTC=totalHT.
 * La base HT est conservée (sous-traitant facture HT, preneur autoliquide la TVA).
 */
export function appliquerRegimeTVA(
  totaux: { totalHT: string; totalTVA: string; totalTTC: string },
  regimeTVA: string | null | undefined,
): { totalHT: string; totalTVA: string; totalTTC: string } {
  if (regimeTVA === "autoliquidation_btp" || regimeTVA === "exonere") {
    return { totalHT: totaux.totalHT, totalTVA: "0.00", totalTTC: totaux.totalHT };
  }
  return totaux;
}

/** TVA réduite travaux (CGI 279-0 bis / 278-0 bis A) : 10 % ou 5,5 % → attestation client requise. */
export function necessite_attestation_tva_reduite(lignes: readonly { tauxTVA: string }[]): boolean {
  return lignes.some((l) => { const t = Number(l.tauxTVA); return t === 10 || t === 5.5; });
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
  return { totalHT: round2(ht).toFixed(2), totalTVA: round2(tva).toFixed(2), totalTTC: round2(ttc).toFixed(2) };
}
