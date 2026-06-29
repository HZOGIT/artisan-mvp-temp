/*
 * Types de domaine du module stocks (inventaire) — découplés du schéma Drizzle.
 * ⚠️ Domaine sensible (quantités, mouvements/audit) : invariants à préserver
 * (traçabilité des mouvements, scoping tenant).
 */

export type StockArticleType = "bibliotheque" | "artisan";
export type MouvementType = "entree" | "sortie" | "ajustement";

export interface Stock {
  readonly id: number;
  readonly artisanId: number;
  readonly articleId: number | null;
  readonly articleType: StockArticleType;
  readonly reference: string;
  readonly designation: string;
  /** numeric PG en string */
  readonly quantiteEnStock: string;
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

/*
 * Quantité en commande (non encore reçue) pour un stock donné. `entrant` = somme des
 * `quantite - quantiteRecue` des lignes de commandes fournisseurs non soldées liées à ce stock.
 */
export interface StockEntrant {
  readonly stockId: number;
  readonly entrant: number;
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
  /*
   * ⚠️ `quantiteEnStock` n'est PAS modifiable via update : seul un mouvement (ajustement
   * tracé) change la quantité (invariant d'audit).
   */
}

/*
 * Entrée d'un mouvement de stock — l'UNIQUE voie de modification de la quantité.
 * `entree`/`ajustement` ajoutent `quantite` à la quantité physique, `sortie` la retranche.
 * `quantite` est le montant (absolu, ≥ 0) du mouvement, pas la quantité cible.
 */
export interface AdjustStockInput {
  readonly type: MouvementType;
  /** montant du mouvement, ≥ 0 (numeric PG en string) */
  readonly quantite: string;
  readonly motif?: string | null;
  readonly reference?: string | null;
}

export type InventaireStatut = "brouillon" | "valide";

export interface Inventaire {
  readonly id: number;
  readonly artisanId: number;
  readonly date: string;
  readonly statut: InventaireStatut;
  readonly note: string | null;
  readonly valeurEcart: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface InventaireLigne {
  readonly id: number;
  readonly inventaireId: number;
  readonly stockId: number;
  readonly reference: string;
  readonly designation: string;
  readonly unite: string;
  readonly quantiteTheorique: string;
  readonly quantiteReelle: string | null;
  readonly ecart: string | null;
}

export interface InventaireAvecLignes {
  readonly inventaire: Inventaire;
  readonly lignes: InventaireLigne[];
}

export interface DemarrerInventaireInput {
  readonly date?: string;
  readonly note?: string;
}

export interface SaisirComptageInput {
  readonly ligneId: number;
  readonly quantiteReelle: string;
}

export interface ValiderInventaireResult {
  readonly inventaire: Inventaire;
  readonly ajustementsCreees: number;
  readonly valeurEcart: number;
}
