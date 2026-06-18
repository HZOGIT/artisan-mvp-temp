// Types de domaine du module regles-categorisation (règles de catégorisation automatique des
// dépenses : un `motifLibelle` rencontré → une `categorie` de dépense, activable/désactivable) —
// découplés du schéma Drizzle. Table `regles_categorisation` (RLS sur artisan_id ; ⚠️ colonnes en
// snake_case côté base → le mapper Drizzle traduit snake_case↔camelCase). CRUD catalogue tenant-scopé.
// ⚠️ PAS de contrainte d'unicité : plusieurs règles peuvent partager motif/catégorie.

export interface RegleCategorisation {
  readonly id: number;
  readonly artisanId: number;
  readonly motifLibelle: string;
  readonly categorie: string;
  readonly actif: boolean;
  readonly createdAt: Date;
}

export interface CreateRegleInput {
  readonly motifLibelle: string;
  readonly categorie: string;
  readonly actif?: boolean;
}

export interface UpdateRegleInput {
  readonly motifLibelle?: string;
  readonly categorie?: string;
  readonly actif?: boolean;
}
