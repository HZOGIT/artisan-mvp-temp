// Bibliothèque d'articles = catalogue de référence **PARTAGÉ** entre tous les artisans (table
// `bibliotheque_articles`, SANS `artisanId` → RLS OFF). Lecture publique (non sensible). Le port
// est volontairement NON tenant : aucune `TenantContext` requise.

export interface BibliothequeArticle {
  readonly id: number;
  readonly metier: string;
  readonly categorie: string;
  readonly sousCategorie: string;
  readonly nom: string;
  readonly description: string | null;
  readonly prixBase: string;
  readonly unite: string;
  readonly tauxTVA: string | null;
  readonly prixRevient: string | null;
  readonly dureeMoyenneMinutes: number | null;
  readonly visible: boolean;
}

export interface BibliothequeFiltre {
  readonly metier?: string;
  readonly categorie?: string;
}

// Lecture du catalogue partagé. Aucune écriture ici (les mutations sont réservées au staff Operioz
// via une procédure admin — concern séparée). Pas de scope tenant : référentiel commun.
export interface BibliothequeReader {
  // Liste filtrable par métier/catégorie (parité legacy `getBibliothequeArticles`).
  list(filtre?: BibliothequeFiltre): Promise<BibliothequeArticle[]>;
  // Recherche plein-texte (nom/description), optionnellement bornée à un métier (limit 50).
  search(query: string, metier?: string): Promise<BibliothequeArticle[]>;
}
