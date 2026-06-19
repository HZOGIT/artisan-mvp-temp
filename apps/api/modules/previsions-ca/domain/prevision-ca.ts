/*
 * Types de domaine du module previsions-ca (prévision de chiffre d'affaires par mois/année : CA
 * prévisionnel vs réalisé, écart absolu et en %, méthode de calcul, indice de confiance) — découplés
 * du schéma Drizzle. Table `previsions_ca` (RLS sur artisanId ; colonnes camelCase en base → pas de
 * mapping snake_case ; montants `numeric` exposés en string). `mois`/`annee` identifient la période :
 * immuables après création (l'update ne touche que les montants/méthode/confiance).
 */

export type PrevisionMethode = "moyenne_mobile" | "regression_lineaire" | "saisonnalite" | "manuel";

export interface PrevisionCA {
  readonly id: number;
  readonly artisanId: number;
  /** 1-12 */
  readonly mois: number;
  readonly annee: number;
  /** numeric PG en string */
  readonly caPrevisionnel: string;
  readonly caRealise: string;
  /** caRealise - caPrevisionnel (peut être négatif) */
  readonly ecart: string;
  readonly ecartPourcentage: string;
  readonly methodeCalcul: PrevisionMethode;
  /** % de confiance, null si non renseigné */
  readonly confiance: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreatePrevisionInput {
  readonly mois: number;
  readonly annee: number;
  readonly caPrevisionnel?: string;
  readonly caRealise?: string;
  readonly ecart?: string;
  readonly ecartPourcentage?: string;
  readonly methodeCalcul?: PrevisionMethode;
  readonly confiance?: string | null;
}

/** Update des montants/méthode/confiance uniquement. ⚠️ `mois`/`annee` ABSENTS (période immuable). */
export interface UpdatePrevisionInput {
  readonly caPrevisionnel?: string;
  readonly caRealise?: string;
  readonly ecart?: string;
  readonly ecartPourcentage?: string;
  readonly methodeCalcul?: PrevisionMethode;
  readonly confiance?: string | null;
}

/*
 * Historique de CA mensuel agrégé (table `historique_ca`, RLS sur artisanId). Lecture seule côté
 * new-stack pour l'instant (le recalcul `calculerHistoriqueCAMensuel` reste à porter — agrège les
 * factures payées). Montants `numeric` exposés en string.
 */
export interface HistoriqueCA {
  readonly id: number;
  readonly artisanId: number;
  /** 1-12 */
  readonly mois: number;
  readonly annee: number;
  readonly caTotal: string;
  readonly nombreFactures: number;
  readonly nombreClients: number;
  readonly panierMoyen: string;
  readonly tauxConversion: string | null;
  readonly createdAt: Date;
}

/*
 * Comparaison prévu vs réalisé pour un mois (agrégat lecture seule, montants en nombre). Parité
 * legacy `getComparaisonPrevisionsRealise`.
 */
export interface ComparaisonMois {
  readonly mois: number;
  readonly caPrevisionnel: number;
  readonly caRealise: number;
  /** caRealise - caPrevisionnel */
  readonly ecart: number;
  readonly ecartPourcentage: number;
}

/*
 * Agrégat de CA réalisé par mois (issu des factures PAYÉES du tenant) — sert au recalcul de
 * l'historique (`calculer`). Montant en string (numeric PG).
 */
export interface CAParMois {
  readonly mois: number;
  readonly annee: number;
  readonly caTotal: string;
  readonly nombreFactures: number;
  readonly nombreClients: number;
}

/** Upsert d'une ligne d'historique de CA (delete+insert par (artisan,mois,annee)). */
export interface UpsertHistoriqueInput {
  readonly mois: number;
  readonly annee: number;
  readonly caTotal: string;
  readonly nombreFactures: number;
  readonly nombreClients: number;
  readonly panierMoyen: string;
}

/** Upsert d'une prévision calculée (delete+insert par (artisan,mois,annee)). */
export interface UpsertPrevisionInput {
  readonly mois: number;
  readonly annee: number;
  readonly caPrevisionnel: string;
  readonly methodeCalcul: PrevisionMethode;
  readonly confiance: string;
}

/** Une prédiction mensuelle calculée (sortie de `calculer`). */
export interface PredictionMois {
  readonly mois: number;
  readonly caPrevisionnel: number;
  readonly confiance: number;
}

/** Résultat de `calculer` : soit les prédictions calculées, soit un message (pas assez d'historique). */
export interface CalculPrevisionsResult {
  readonly predictions?: PredictionMois[];
  readonly methode?: PrevisionMethode;
  readonly annee?: number;
  readonly message?: string;
}

/*
 * ── Trésorerie prévisionnelle (flux net hebdomadaire) ─────────────────────────────────────────
 * Créance = facture non soldée (encaissement attendu à `dateEcheance`, reste dû = totalTTC−montantPaye).
 */
export interface Creance {
  readonly dateEcheance: string | null;
  readonly totalTTC: string;
  readonly montantPaye: string;
}

/** Dépense récurrente (décaissement attendu, expansé selon la fréquence à partir de `prochaineOccurrence`). */
export interface DepenseRecurrente {
  readonly montantTtc: string;
  /** mensuelle | trimestrielle | annuelle */
  readonly frequence: string | null;
  readonly prochaineOccurrence: string | null;
}

/** Données brutes (scopées tenant) nécessaires au calcul de la trésorerie prévisionnelle. */
export interface TresorerieData {
  readonly creances: Creance[];
  /** totalTTC des avoirs (crédits client) — nettés contre les entrées */
  readonly avoirsTotalTTC: string[];
  readonly depensesRecurrentes: DepenseRecurrente[];
}

export interface TresorerieSemaine {
  /** YYYY-MM-DD (début de la semaine) */
  readonly debut: string;
  readonly entrees: number;
  readonly sorties: number;
  readonly net: number;
  readonly cumulatif: number;
}

export interface TresoreriePrevisionnelle {
  readonly semaines: TresorerieSemaine[];
  readonly totalEntrees: number;
  readonly totalSorties: number;
  readonly totalNet: number;
}
