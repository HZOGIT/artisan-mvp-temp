// Types de domaine du module chantiers (cœur métier : chantiers/projets regroupant des
// interventions) — découplés du schéma Drizzle. ⚠️ FK `clientId` scopée tenant (anti-IDOR-FK),
// isolation cross-tenant, montants (budgets) en decimal/string. Détails des dérivés/transitions
// portés aux étapes ultérieures.

export type ChantierStatut = "planifie" | "en_cours" | "en_pause" | "termine" | "annule";
export type ChantierPriorite = "basse" | "normale" | "haute" | "urgente";

export interface Chantier {
  readonly id: number;
  readonly artisanId: number;
  readonly clientId: number;
  readonly reference: string;
  readonly nom: string;
  readonly description: string | null;
  readonly adresse: string | null;
  readonly codePostal: string | null;
  readonly ville: string | null;
  readonly dateDebut: string | null; // date PG (YYYY-MM-DD)
  readonly dateFinPrevue: string | null;
  readonly dateFinReelle: string | null;
  readonly budgetPrevisionnel: string | null; // numeric PG en string
  readonly budgetRealise: string;
  readonly statut: ChantierStatut;
  readonly avancement: number; // 0..100
  readonly priorite: ChantierPriorite;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateChantierInput {
  readonly clientId: number;
  readonly reference: string;
  readonly nom: string;
  readonly description?: string | null;
  readonly adresse?: string | null;
  readonly codePostal?: string | null;
  readonly ville?: string | null;
  readonly dateDebut?: string | null;
  readonly dateFinPrevue?: string | null;
  readonly dateFinReelle?: string | null;
  readonly budgetPrevisionnel?: string | null;
  readonly budgetRealise?: string;
  readonly statut?: ChantierStatut;
  readonly avancement?: number;
  readonly priorite?: ChantierPriorite;
  readonly notes?: string | null;
}

export interface UpdateChantierInput {
  // ⚠️ `clientId` n'est pas modifiable via update : le client d'un chantier ne change pas
  // (cohérence référentielle). Présent dans Create uniquement.
  readonly reference?: string;
  readonly nom?: string;
  readonly description?: string | null;
  readonly adresse?: string | null;
  readonly codePostal?: string | null;
  readonly ville?: string | null;
  readonly dateDebut?: string | null;
  readonly dateFinPrevue?: string | null;
  readonly dateFinReelle?: string | null;
  readonly budgetPrevisionnel?: string | null;
  readonly budgetRealise?: string;
  readonly statut?: ChantierStatut;
  readonly avancement?: number;
  readonly priorite?: ChantierPriorite;
  readonly notes?: string | null;
}

// ── Pointages (saisie de temps sur un chantier) ──────────────────────────────────────────────
// Table `pointages_chantier` : heures passées par un technicien sur un chantier (et phase
// optionnelle). Scopée tenant (artisanId) ET via le chantier parent (anti-IDOR). `date` = jour PG
// (YYYY-MM-DD), `heures` = decimal/string.
export interface ChantierPointage {
  readonly id: number;
  readonly chantierId: number;
  readonly phaseId: number | null;
  readonly technicienId: number | null;
  readonly date: string;
  readonly heures: string;
  readonly description: string | null;
  readonly createdAt: Date;
}

// Entrée de création d'un pointage. `artisanId` forcé serveur ; `technicienId` validé (anti-IDOR-FK,
// ignoré → null s'il n'appartient pas au tenant). `date` = YYYY-MM-DD (validée au use-case).
export interface CreatePointageInput {
  readonly chantierId: number;
  readonly phaseId?: number | null;
  readonly technicienId?: number | null;
  readonly date: string;
  readonly heures: string;
  readonly description?: string | null;
}

// ── Suivi de chantier (avancement / jalons) ──────────────────────────────────────────────────
// Table `suivi_chantier` : étapes de suivi d'un chantier. ⚠️ **SANS artisanId** → scopée UNIQUEMENT
// via le chantier parent (anti-IDOR : toute opération exige l'ownership du chantier ; pas de RLS sur
// cette table). `dateDebut`/`dateFin` = jour PG (YYYY-MM-DD).
export type SuiviStatut = "a_faire" | "en_cours" | "termine";

export interface ChantierSuivi {
  readonly id: number;
  readonly chantierId: number;
  readonly titre: string;
  readonly description: string | null;
  readonly statut: SuiviStatut;
  readonly pourcentage: number;
  readonly ordre: number;
  readonly visibleClient: boolean;
  readonly dateDebut: string | null;
  readonly dateFin: string | null;
  readonly commentaire: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateSuiviInput {
  readonly chantierId: number;
  readonly titre: string;
  readonly description?: string | null;
  readonly statut?: SuiviStatut;
  readonly pourcentage?: number;
  readonly ordre?: number;
  readonly visibleClient?: boolean;
  readonly dateDebut?: string | null;
  readonly dateFin?: string | null;
  readonly commentaire?: string | null;
}

export interface UpdateSuiviInput {
  readonly titre?: string;
  readonly description?: string | null;
  readonly statut?: SuiviStatut;
  readonly pourcentage?: number;
  readonly ordre?: number;
  readonly visibleClient?: boolean;
  readonly dateDebut?: string | null;
  readonly dateFin?: string | null;
  readonly commentaire?: string | null;
}

// ── Phases de chantier (planification / découpage en lots) ────────────────────────────────────
// Table `phases_chantier` : ⚠️ **SANS artisanId** → scopée UNIQUEMENT via le chantier parent
// (anti-IDOR ; pas de RLS sur cette table). Les colonnes `date*` = jour PG (YYYY-MM-DD) ;
// `budgetPhase`/`coutReel`/`heuresPrevues` = décimaux string.
export type PhaseStatut = "a_faire" | "en_cours" | "termine" | "annule";

export interface ChantierPhase {
  readonly id: number;
  readonly chantierId: number;
  readonly nom: string;
  readonly description: string | null;
  readonly ordre: number;
  readonly dateDebutPrevue: string | null;
  readonly dateFinPrevue: string | null;
  readonly dateDebutReelle: string | null;
  readonly dateFinReelle: string | null;
  readonly statut: PhaseStatut;
  readonly avancement: number;
  readonly budgetPhase: string | null;
  readonly coutReel: string | null;
  readonly heuresPrevues: string | null;
  readonly createdAt: Date;
}

export interface CreatePhaseInput {
  readonly chantierId: number;
  readonly nom: string;
  readonly description?: string | null;
  readonly ordre?: number;
  readonly dateDebutPrevue?: string | null;
  readonly dateFinPrevue?: string | null;
  readonly budgetPhase?: string | null;
  readonly heuresPrevues?: string | null;
}

export interface UpdatePhaseInput {
  readonly nom?: string;
  readonly statut?: PhaseStatut;
  readonly avancement?: number;
  readonly dateDebutReelle?: string | null;
  readonly dateFinReelle?: string | null;
  readonly coutReel?: string | null;
  readonly heuresPrevues?: string | null;
}

// ── Interventions rattachées à un chantier (table de liaison `interventions_chantier`) ─────────
// ⚠️ **SANS artisanId** → scopée via le chantier parent. L'association exige que LE CHANTIER **et**
// L'INTERVENTION appartiennent au tenant (anti-IDOR DOUBLE).
export interface ChantierInterventionLien {
  readonly id: number;
  readonly chantierId: number;
  readonly interventionId: number;
  readonly phaseId: number | null;
  readonly ordre: number;
  readonly createdAt: Date;
}

export interface AssocierInterventionInput {
  readonly chantierId: number;
  readonly interventionId: number;
  readonly phaseId?: number | null;
  readonly ordre?: number;
}
