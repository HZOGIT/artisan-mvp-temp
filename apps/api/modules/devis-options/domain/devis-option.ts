/*
 * Option (« variante ») d'un devis : une proposition alternative attachée à un devis parent (table
 * `devis_options`, SANS artisanId → hors RLS). L'isolation multi-tenant est portée par l'appartenance
 * du DEVIS parent (lui sous RLS + filtre artisanId). Montants stockés tels quels (chaînes numeric).
 */
export interface DevisOption {
  readonly id: number;
  readonly devisId: number;
  readonly nom: string;
  readonly description: string | null;
  readonly ordre: number;
  readonly totalHT: string;
  readonly totalTVA: string;
  readonly totalTTC: string;
  readonly recommandee: boolean;
  readonly selectionnee: boolean;
  readonly dateSelection: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Champs de création d'une option (le devis parent est désigné par `devisId`, vérifié possédé). */
export interface CreateDevisOptionInput {
  readonly devisId: number;
  readonly nom: string;
  readonly description?: string | null;
  readonly ordre?: number;
  readonly recommandee?: boolean;
}
