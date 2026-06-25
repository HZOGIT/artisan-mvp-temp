import { round2 } from "../../../shared/money";
import { TVA_CATEGORIES_MAP } from "../../../shared/tva/taux-tva-fr";

/*
 * Devis IA : analyse de photos de chantier (Vision) → résultats détectés → suggestions d'articles →
 * génération d'un devis. Slice A = CRUD/lecture (analyses, photos, suggestions) ; l'IA (analyserPhotos
 * Vision + genererDevis LLM) = slice B. Anti-IDOR : `analyses_photos_chantier` porte `artisanId` (RLS) ;
 * les tables filles (photos/résultats/suggestions/devis généré) sont scopées via l'analyse parente.
 */

export interface Analyse {
  readonly id: number;
  readonly clientId: number | null;
  readonly titre: string | null;
  readonly description: string | null;
  readonly statut: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date | null;
}

export interface Photo {
  readonly id: number;
  readonly analyseId: number;
  readonly url: string;
  readonly description: string | null;
  readonly ordre: number | null;
  readonly uploadedAt: Date | null;
}

export interface Suggestion {
  readonly id: number;
  readonly resultatId: number;
  readonly articleId: number | null;
  readonly nomArticle: string | null;
  readonly description: string | null;
  readonly quantiteSuggeree: string | null;
  readonly unite: string | null;
  readonly prixEstime: string | null;
  readonly confiance: string | null;
  readonly selectionne: boolean | null;
  readonly createdAt: Date;
}

export interface Resultat {
  readonly id: number;
  readonly analyseId: number;
  readonly typeTravauxDetecte: string | null;
  readonly descriptionTravaux: string | null;
  readonly urgence: string | null;
  readonly confiance: string | null;
  readonly createdAt: Date;
}

export interface ResultatAvecSuggestions extends Resultat {
  readonly suggestions: readonly Suggestion[];
}

export interface DevisGenere {
  readonly id: number;
  readonly analyseId: number;
  readonly devisId: number | null;
  readonly montantEstime: string | null;
  readonly createdAt: Date;
}

/** Détail complet d'une analyse (parité legacy `getById`). */
export interface AnalyseDetail extends Analyse {
  readonly photos: readonly Photo[];
  readonly resultats: readonly ResultatAvecSuggestions[];
  readonly devisGenere: DevisGenere | null;
}

export interface CreateAnalyseInput {
  readonly clientId?: number;
  readonly titre?: string;
  readonly description?: string;
}

export interface AddPhotoInput {
  readonly url: string;
  readonly description?: string;
  readonly ordre?: number;
}

export interface UpdateSuggestionInput {
  readonly selectionne?: boolean;
  readonly quantiteSuggeree?: string;
  readonly prixEstime?: string;
}

/** ── Génération de devis depuis les suggestions sélectionnées (genererDevis) ── */
export interface LigneDevisIA {
  readonly ordre: number;
  readonly designation: string;
  readonly quantite: number;
  readonly unite: string;
  readonly prixUnitaireHT: number;
  readonly tauxTVA: number;
  readonly montantHT: number;
  readonly montantTVA: number;
  readonly montantTTC: number;
}

export interface DevisIATotals {
  readonly lignes: readonly LigneDevisIA[];
  readonly totalHT: number;
  readonly totalTVA: number;
  readonly totalTTC: number;
}

/*
 * Construit les lignes + totaux d'un devis à partir des suggestions SÉLECTIONNÉES (parité legacy
 * `creerDevisDepuisAnalyseIA`). TVA fixe 20 %. `suggestionIds` optionnel restreint le sous-ensemble.
 * Renvoie null si aucune ligne (rien à générer). PUR (totaux dérivés des lignes → cohérents).
 */
export function genererLignesDevis(suggestions: readonly Suggestion[], suggestionIds?: readonly number[]): DevisIATotals | null {
  const idSet = suggestionIds ? new Set(suggestionIds) : null;
  const lignes: LigneDevisIA[] = [];
  let totalHT = 0;
  let totalTVA = 0;
  for (const s of suggestions) {
    if (idSet && !idSet.has(s.id)) continue;
    if (!s.selectionne) continue;
    const quantite = Number(s.quantiteSuggeree || 1);
    const prixUnitaireHT = Number(s.prixEstime || 0);
    const categorieId = "FR_20";
    const tauxTVA = parseFloat(TVA_CATEGORIES_MAP[categorieId].taux);
    const montantHT = round2(quantite * prixUnitaireHT);
    const montantTVA = round2(montantHT * (tauxTVA / 100));
    const montantTTC = round2(montantHT + montantTVA);
    lignes.push({ ordre: lignes.length, designation: s.nomArticle || "", quantite, unite: s.unite || "u", prixUnitaireHT, tauxTVA, montantHT, montantTVA, montantTTC });
    totalHT += montantHT;
    totalTVA += montantTVA;
  }
  if (lignes.length === 0) return null;
  return { lignes, totalHT: round2(totalHT), totalTVA: round2(totalTVA), totalTTC: round2(totalHT + totalTVA) };
}
