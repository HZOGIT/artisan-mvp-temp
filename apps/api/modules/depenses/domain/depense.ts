/*
 * Types de domaine du module depenses (compta — dépenses/achats) — découplés du schéma
 * Drizzle. ⚠️ Domaine sensible : montants/TVA exacts (decimal/string, pas de float ;
 * montant_ttc = montant_ht + montant_tva), isolation cross-tenant, FK (chantier/intervention/
 * client) scopées tenant (anti-IDOR-FK). Le workflow (soumettre/approuver/rejeter/rembourser)
 * + la récurrence + l'OCR sont portés aux étapes ultérieures.
 * 
 * NB : la table `depenses` est en snake_case (`artisan_id`, `montant_ht`, `date_depense`…) —
 * le mapping vers ces noms camelCase est fait dans l'infra (Drizzle).
 */

export type DepenseStatut = "brouillon" | "soumise" | "approuvee" | "rejetee" | "remboursee";
export type DepenseModePaiement = "carte" | "especes" | "virement" | "cheque" | "prelevement";
export type DepenseFrequence = "mensuelle" | "trimestrielle" | "annuelle";

export interface Depense {
  readonly id: number;
  readonly artisanId: number;
  readonly userId: number; // créateur
  readonly numero: string;
  readonly dateDepense: string; // date PG (YYYY-MM-DD)
  readonly fournisseur: string | null;
  readonly categorie: string;
  readonly sousCategorie: string | null;
  readonly description: string | null;
  readonly montantHt: string; // numeric PG en string
  readonly tauxTva: string | null;
  readonly montantTva: string | null;
  readonly montantTtc: string;
  readonly modePaiement: DepenseModePaiement;
  readonly statut: DepenseStatut;
  readonly remboursable: boolean;
  readonly rembourse: boolean;
  readonly dateRemboursement: string | null;
  readonly chantierId: number | null;
  readonly interventionId: number | null;
  readonly clientId: number | null;
  readonly notes: string | null;
  readonly justificatifUrl: string | null;
  readonly justificatifNom: string | null;
  readonly ocrBrut: string | null;
  readonly ocrTraite: boolean;
  readonly recurrente: boolean;
  readonly frequenceRecurrence: DepenseFrequence | null;
  readonly prochaineOccurrence: string | null;
  readonly tvaDeductible: boolean;
  readonly createdAt: Date | null;
  readonly updatedAt: Date | null;
}

export interface CreateDepenseInput {
  readonly userId: number;
  readonly numero: string;
  readonly dateDepense: string;
  readonly categorie: string;
  readonly montantHt: string;
  readonly montantTtc: string;
  readonly fournisseur?: string | null;
  readonly sousCategorie?: string | null;
  readonly description?: string | null;
  readonly tauxTva?: string | null;
  readonly montantTva?: string | null;
  readonly modePaiement?: DepenseModePaiement;
  readonly remboursable?: boolean;
  readonly chantierId?: number | null;
  readonly interventionId?: number | null;
  readonly clientId?: number | null;
  readonly notes?: string | null;
  readonly justificatifUrl?: string | null;
  readonly justificatifNom?: string | null;
  readonly recurrente?: boolean;
  readonly frequenceRecurrence?: DepenseFrequence | null;
  readonly prochaineOccurrence?: string | null;
  readonly tvaDeductible?: boolean;
}

export interface UpdateDepenseInput {
  /*
   * ⚠️ `statut`/`rembourse`/`dateRemboursement`/`userId` ne sont PAS modifiables ici : ils
   * changent via le workflow (étape ultérieure) qui porte l'anti self-approbation + intégrité.
   */
  readonly numero?: string;
  readonly dateDepense?: string;
  readonly categorie?: string;
  readonly montantHt?: string;
  readonly montantTtc?: string;
  readonly fournisseur?: string | null;
  readonly sousCategorie?: string | null;
  readonly description?: string | null;
  readonly tauxTva?: string | null;
  readonly montantTva?: string | null;
  readonly modePaiement?: DepenseModePaiement;
  readonly remboursable?: boolean;
  readonly chantierId?: number | null;
  readonly interventionId?: number | null;
  readonly clientId?: number | null;
  readonly notes?: string | null;
  readonly justificatifUrl?: string | null;
  readonly justificatifNom?: string | null;
  readonly recurrente?: boolean;
  readonly frequenceRecurrence?: DepenseFrequence | null;
  readonly prochaineOccurrence?: string | null;
  readonly tvaDeductible?: boolean;
}

// ── Détection de doublons (aide à la saisie) ──────────────────────────────────────────────────
export interface DoublonParams {
  readonly montantTtc: number;
  readonly dateDepense: string;
  readonly fournisseur?: string | null;
  readonly excludeId?: number;
}

export interface DepenseDoublon {
  readonly id: number;
  readonly numero: string;
  readonly montantTtc: string;
  readonly dateDepense: string;
  readonly fournisseur: string | null;
  readonly description: string | null;
  readonly statut: string;
}

// ── Statistiques de dépenses (tableau de bord) ────────────────────────────────────────────────
export interface DepenseStatsCategorie {
  readonly categorie: string;
  readonly total: string;
  readonly nb: number;
}
export interface DepenseStatsTop {
  readonly id: number;
  readonly numero: string;
  readonly fournisseur: string | null;
  readonly categorie: string;
  readonly montant_ttc: string;
  readonly date_depense: string;
}
export interface DepenseStatsFournisseur {
  readonly fournisseur: string | null;
  readonly total: string;
  readonly nb: number;
}
export interface DepenseStatsMois {
  readonly mois: string;
  readonly total: string;
}
export interface DepenseStats {
  readonly mois: string;
  readonly totalMois: number;
  readonly nbDepensesMois: number;
  readonly aRembourser: number;
  readonly tvaRecuperable: number;
  readonly totalMoisPrecedent: number;
  readonly variation: number | null;
  readonly totalAnnee: number;
  readonly parCategorie: DepenseStatsCategorie[];
  readonly topDepenses: DepenseStatsTop[];
  readonly topFournisseurs: DepenseStatsFournisseur[];
  readonly parMois: DepenseStatsMois[];
}
