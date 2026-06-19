/*
 * Types de domaine du module categories-depenses (catégories de dépenses configurables par
 * l'artisan) — découplés du schéma Drizzle. Table `categories_depenses` (RLS sur artisan_id ;
 * ⚠️ colonnes en snake_case côté base → le mapper Drizzle traduit snake_case↔camelCase). CRUD
 * catalogue tenant-scopé. ⚠️ Contrainte DB UNIQUE (artisan_id, nom) → un nom de catégorie est unique
 * par artisan (invariant anti-doublon, géré en write use-case + ConflictError sur violation).
 */

export interface CategorieDepense {
  readonly id: number;
  readonly artisanId: number;
  readonly nom: string;
  readonly couleur: string;
  readonly icone: string;
  readonly compteComptable: string | null;
  readonly deductibleTva: boolean;
  readonly deductibleIr: boolean;
  /** numeric PG en string */
  readonly plafondMensuel: string | null;
  readonly actif: boolean;
  readonly ordre: number;
  readonly createdAt: Date;
}

export interface CreateCategorieInput {
  readonly nom: string;
  readonly couleur?: string;
  readonly icone?: string;
  readonly compteComptable?: string | null;
  readonly deductibleTva?: boolean;
  readonly deductibleIr?: boolean;
  readonly plafondMensuel?: string | null;
  readonly actif?: boolean;
  readonly ordre?: number;
}

export interface UpdateCategorieInput {
  readonly nom?: string;
  readonly couleur?: string;
  readonly icone?: string;
  readonly compteComptable?: string | null;
  readonly deductibleTva?: boolean;
  readonly deductibleIr?: boolean;
  readonly plafondMensuel?: string | null;
  readonly actif?: boolean;
  readonly ordre?: number;
}
