// Types de domaine du module previsions-ca (prévision de chiffre d'affaires par mois/année : CA
// prévisionnel vs réalisé, écart absolu et en %, méthode de calcul, indice de confiance) — découplés
// du schéma Drizzle. Table `previsions_ca` (RLS sur artisanId ; colonnes camelCase en base → pas de
// mapping snake_case ; montants `numeric` exposés en string). `mois`/`annee` identifient la période :
// immuables après création (l'update ne touche que les montants/méthode/confiance).

export type PrevisionMethode = "moyenne_mobile" | "regression_lineaire" | "saisonnalite" | "manuel";

export interface PrevisionCA {
  readonly id: number;
  readonly artisanId: number;
  readonly mois: number; // 1-12
  readonly annee: number;
  readonly caPrevisionnel: string; // numeric PG en string
  readonly caRealise: string;
  readonly ecart: string; // caRealise - caPrevisionnel (peut être négatif)
  readonly ecartPourcentage: string;
  readonly methodeCalcul: PrevisionMethode;
  readonly confiance: string | null; // % de confiance, null si non renseigné
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

// Update des montants/méthode/confiance uniquement. ⚠️ `mois`/`annee` ABSENTS (période immuable).
export interface UpdatePrevisionInput {
  readonly caPrevisionnel?: string;
  readonly caRealise?: string;
  readonly ecart?: string;
  readonly ecartPourcentage?: string;
  readonly methodeCalcul?: PrevisionMethode;
  readonly confiance?: string | null;
}

// Historique de CA mensuel agrégé (table `historique_ca`, RLS sur artisanId). Lecture seule côté
// new-stack pour l'instant (le recalcul `calculerHistoriqueCAMensuel` reste à porter — agrège les
// factures payées). Montants `numeric` exposés en string.
export interface HistoriqueCA {
  readonly id: number;
  readonly artisanId: number;
  readonly mois: number; // 1-12
  readonly annee: number;
  readonly caTotal: string;
  readonly nombreFactures: number;
  readonly nombreClients: number;
  readonly panierMoyen: string;
  readonly tauxConversion: string | null;
  readonly createdAt: Date;
}

// Comparaison prévu vs réalisé pour un mois (agrégat lecture seule, montants en nombre). Parité
// legacy `getComparaisonPrevisionsRealise`.
export interface ComparaisonMois {
  readonly mois: number;
  readonly caPrevisionnel: number;
  readonly caRealise: number;
  readonly ecart: number; // caRealise - caPrevisionnel
  readonly ecartPourcentage: number;
}
