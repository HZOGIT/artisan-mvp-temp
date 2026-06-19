/*
 * Types de domaine du module budgets-categories (budget mensuel prévu par catégorie de dépense ;
 * suivi budget vs dépense réelle) — découplés du schéma Drizzle. Table `budgets_categories` (RLS sur
 * artisan_id ; ⚠️ colonnes snake_case → le mapper Drizzle traduit snake_case↔camelCase). ⚠️
 * Contrainte DB UNIQUE (artisan_id, categorie, mois) → un seul budget par (catégorie, mois) par
 * artisan (invariant anti-doublon). `categorie`/`mois` forment la clé d'unicité : immuables après
 * création (changer = supprimer + recréer) ; l'update ne touche que les montants.
 */

export interface BudgetCategorie {
  readonly id: number;
  readonly artisanId: number;
  readonly categorie: string;
  /** "YYYY-MM" */
  readonly mois: string;
  /** numeric PG en string */
  readonly budget: string;
  readonly depenseReelle: string;
}

export interface CreateBudgetInput {
  readonly categorie: string;
  readonly mois: string;
  readonly budget?: string;
  readonly depenseReelle?: string;
}

/** Update des montants uniquement. ⚠️ `categorie`/`mois` ABSENTS (clé d'unicité immuable). */
export interface UpdateBudgetInput {
  readonly budget?: string;
  readonly depenseReelle?: string;
}
