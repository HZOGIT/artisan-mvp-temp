/** Données pour l'export FEC achats (Fichier des Écritures Comptables, format AFNOR). Lecture seule. */

/** Dépense déductible incluse dans le FEC (sous-ensemble de champs). */
export interface FecDepense {
  readonly id: number;
  readonly numero: string;
  /** YYYY-MM-DD */
  readonly dateDepense: string;
  readonly fournisseur: string | null;
  readonly montantHt: string;
  readonly montantTva: string;
  readonly montantTtc: string;
  readonly description: string | null;
  readonly remboursable: boolean;
}

/** Configuration comptable du tenant (comptes + journal d'achats), avec valeurs par défaut PCG. */
export interface ConfigComptable {
  readonly compteAchats: string;
  readonly compteTVADeductible: string;
  readonly compteFournisseurs: string;
  readonly journalAchats: string;
}
