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
