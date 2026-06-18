// Types de domaine du module articles (catalogue produits/services de l'artisan) — découplés du
// schéma Drizzle. Table `articles_artisan` (camelCase, RLS sur artisanId). Domaine CRUD standard
// (réutilisé par les lignes devis/factures côté front). Invariants : isolation cross-tenant ;
// prixUnitaireHT ≥ 0 ; bornes alignées sur la table.
//
// NB : la « bibliothèque » publique (catalogue commun) et la recherche/IA sont une concern
// séparée (référentiel partagé) — hors périmètre de ce domaine tenant-scopé.

export interface Article {
  readonly id: number;
  readonly artisanId: number;
  readonly reference: string;
  readonly designation: string;
  readonly description: string | null;
  readonly unite: string;
  readonly prixUnitaireHT: string; // numeric PG en string
  readonly tauxTVA: string;
  readonly categorie: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateArticleInput {
  readonly reference: string;
  readonly designation: string;
  readonly prixUnitaireHT: string;
  readonly description?: string | null;
  readonly unite?: string;
  readonly tauxTVA?: string;
  readonly categorie?: string | null;
}

export interface UpdateArticleInput {
  readonly reference?: string;
  readonly designation?: string;
  readonly prixUnitaireHT?: string;
  readonly description?: string | null;
  readonly unite?: string;
  readonly tauxTVA?: string;
  readonly categorie?: string | null;
}
