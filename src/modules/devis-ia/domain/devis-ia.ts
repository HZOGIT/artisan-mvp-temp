// Devis IA : analyse de photos de chantier (Vision) → résultats détectés → suggestions d'articles →
// génération d'un devis. Slice A = CRUD/lecture (analyses, photos, suggestions) ; l'IA (analyserPhotos
// Vision + genererDevis LLM) = slice B. Anti-IDOR : `analyses_photos_chantier` porte `artisanId` (RLS) ;
// les tables filles (photos/résultats/suggestions/devis généré) sont scopées via l'analyse parente.

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

// Détail complet d'une analyse (parité legacy `getById`).
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
