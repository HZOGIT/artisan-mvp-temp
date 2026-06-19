/*
 * Types de domaine du module config-relances (configuration des relances automatiques de
 * devis/factures par artisan) — découplés du schéma Drizzle. Table `config_relances_auto` :
 * **singleton par tenant** (artisanId UNIQUE, RLS). Forme get/upsert (comme `parametres`), pas de
 * CRUD by-id.
 * 
 * Invariants (étapes ultérieures) : isolation cross-tenant ; un seul enregistrement par artisan
 * (upsert idempotent) ; validation (jours ≥ 1, nombreMaxRelances borné, heureEnvoi HH:MM, joursEnvoi
 * liste 1..7) ; `modeleEmailId` (réf. lâche vers modeles_email) optionnel — ownership cross-domaine
 * à arbitrer en write use-case.
 */

export interface ConfigRelancesAuto {
  readonly artisanId: number;
  readonly actif: boolean;
  readonly joursApresEnvoi: number;
  readonly joursEntreRelances: number;
  readonly nombreMaxRelances: number;
  readonly heureEnvoi: string; // "HH:MM"
  readonly joursEnvoi: string; // ex. "1,2,3,4,5" (jours de la semaine 1..7)
  readonly modeleEmailId: number | null;
}

// Champs modifiables via la configuration (tous optionnels — upsert partiel).
export interface UpdateConfigRelancesInput {
  readonly actif?: boolean;
  readonly joursApresEnvoi?: number;
  readonly joursEntreRelances?: number;
  readonly nombreMaxRelances?: number;
  readonly heureEnvoi?: string;
  readonly joursEnvoi?: string;
  readonly modeleEmailId?: number | null;
}

/*
 * Valeurs par défaut (alignées sur les DEFAULT de la table) renvoyées par `get` quand aucune ligne
 * n'existe encore pour le tenant — le domaine garantit un singleton toujours lisible.
 */
export function defaultConfigRelances(artisanId: number): ConfigRelancesAuto {
  return {
    artisanId,
    actif: false,
    joursApresEnvoi: 7,
    joursEntreRelances: 7,
    nombreMaxRelances: 3,
    heureEnvoi: "09:00",
    joursEnvoi: "1,2,3,4,5",
    modeleEmailId: null,
  };
}
