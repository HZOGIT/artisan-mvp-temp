// Types de domaine du module stocks (inventaire) — découplés du schéma Drizzle.
// ⚠️ Domaine sensible (quantités, mouvements/audit) : invariants à préserver
// (traçabilité des mouvements, scoping tenant).

export type StockArticleType = "bibliotheque" | "artisan";
export type MouvementType = "entree" | "sortie" | "ajustement";

export interface Stock {
  readonly id: number;
  readonly artisanId: number;
  readonly articleId: number | null;
  readonly articleType: StockArticleType;
  readonly reference: string;
  readonly designation: string;
  readonly quantiteEnStock: string; // numeric PG en string
  readonly seuilAlerte: string;
  readonly unite: string;
  readonly prixAchat: string | null;
  readonly emplacement: string | null;
  readonly fournisseur: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface MouvementStock {
  readonly id: number;
  readonly stockId: number;
  readonly type: MouvementType;
  readonly quantite: string;
  readonly quantiteAvant: string;
  readonly quantiteApres: string;
  readonly motif: string | null;
  readonly reference: string | null;
  readonly createdAt: Date;
}

export interface CreateStockInput {
  readonly articleId?: number | null;
  readonly articleType?: StockArticleType;
  readonly reference: string;
  readonly designation: string;
  readonly quantiteEnStock?: string;
  readonly seuilAlerte?: string;
  readonly unite?: string;
  readonly prixAchat?: string | null;
  readonly emplacement?: string | null;
  readonly fournisseur?: string | null;
}

export interface UpdateStockInput {
  readonly reference?: string;
  readonly designation?: string;
  readonly seuilAlerte?: string;
  readonly unite?: string;
  readonly prixAchat?: string | null;
  readonly emplacement?: string | null;
  readonly fournisseur?: string | null;
  // ⚠️ `quantiteEnStock` n'est PAS modifiable via update : seul un mouvement (ajustement
  // tracé) change la quantité (invariant d'audit).
}
