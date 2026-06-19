/*
 * Types de domaine du module commandes fournisseurs — découplés du schéma Drizzle.
 * ⚠️ Domaine sensible (montants, réception stock) : invariants à préserver (totaux,
 * quantité reçue ≤ commandée, scoping tenant).
 */

export type CommandeStatut =
  | "brouillon"
  | "envoyee"
  | "confirmee"
  | "partiellement_livree"
  | "livree"
  | "annulee";

export type CommandeStatutFacturation = "a_facturer" | "facturee";

export interface LigneCommande {
  readonly id: number;
  readonly commandeId: number;
  readonly articleId: number | null;
  readonly stockId: number | null;
  readonly designation: string;
  readonly reference: string | null;
  /** numeric PG en string */
  readonly quantite: string;
  readonly quantiteRecue: string;
  readonly unite: string;
  readonly prixUnitaire: string | null;
  readonly tauxTVA: string;
  readonly montantTotal: string | null;
}

export interface Commande {
  readonly id: number;
  readonly artisanId: number;
  readonly fournisseurId: number;
  readonly numero: string | null;
  readonly reference: string | null;
  readonly dateCommande: Date;
  readonly dateLivraisonPrevue: Date | null;
  readonly dateLivraisonReelle: Date | null;
  readonly statut: CommandeStatut;
  readonly totalHT: string | null;
  readonly totalTVA: string | null;
  readonly totalTTC: string | null;
  readonly montantTotal: string | null;
  readonly adresseLivraison: string | null;
  readonly notes: string | null;
  readonly statutFacturation: CommandeStatutFacturation;
  readonly depenseId: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateLigneInput {
  readonly articleId?: number | null;
  readonly designation: string;
  readonly reference?: string | null;
  readonly quantite: string;
  readonly unite?: string;
  readonly prixUnitaire?: string | null;
  readonly tauxTVA?: string;
}

export interface CreateCommandeInput {
  readonly fournisseurId: number;
  readonly reference?: string | null;
  readonly dateLivraisonPrevue?: Date | null;
  readonly adresseLivraison?: string | null;
  readonly notes?: string | null;
  readonly lignes: readonly CreateLigneInput[];
}

export interface UpdateCommandeInput {
  readonly reference?: string | null;
  readonly dateLivraisonPrevue?: Date | null;
  readonly adresseLivraison?: string | null;
  readonly notes?: string | null;
}
