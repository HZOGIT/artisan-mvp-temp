/*
 * Types de domaine du module contrats-maintenance (contrats récurrents de maintenance/entretien
 * d'un client) — découplés du schéma Drizzle. Table `contrats_maintenance` (RLS sur artisanId).
 * ⚠️ Domaine semi-sensible financier : montants HT/TVA, `reference` générée serveur, `clientId`
 * anti-IDOR-FK, statut initial "actif" non usurpable, transitions de statut maîtrisées.
 */

export type ContratType = "maintenance_preventive" | "entretien" | "depannage" | "contrat_service";
export type ContratPeriodicite = "mensuel" | "trimestriel" | "semestriel" | "annuel";
export type ContratStatut = "actif" | "suspendu" | "termine" | "annule";

export interface Contrat {
  readonly id: number;
  readonly artisanId: number;
  readonly clientId: number;
  readonly reference: string;
  readonly titre: string;
  readonly description: string | null;
  readonly type: ContratType;
  /** numeric PG en string */
  readonly montantHT: string;
  readonly tauxTVA: string;
  readonly periodicite: ContratPeriodicite;
  readonly dateDebut: Date;
  readonly dateFin: Date | null;
  readonly reconduction: boolean;
  readonly preavisResiliation: number;
  readonly prochainFacturation: Date | null;
  readonly prochainPassage: Date | null;
  readonly conditionsParticulieres: string | null;
  readonly statut: ContratStatut;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/*
 * Entrée de création : `reference` est générée serveur (jamais fournie) ; `statut` ("actif") est
 * posé par l'infra. `clientId` est validé (anti-IDOR) au use-case.
 */
export interface CreateContratInput {
  readonly clientId: number;
  readonly titre: string;
  readonly montantHT: string;
  readonly periodicite: ContratPeriodicite;
  readonly dateDebut: Date;
  readonly type?: ContratType;
  readonly tauxTVA?: string;
  readonly description?: string | null;
  readonly dateFin?: Date | null;
  readonly reconduction?: boolean;
  readonly preavisResiliation?: number;
  readonly prochainFacturation?: Date | null;
  readonly prochainPassage?: Date | null;
  readonly conditionsParticulieres?: string | null;
  readonly notes?: string | null;
}

/*
 * ── Interventions liées à un contrat (sous-ressource `interventions_contrat`) ────────────────
 * Visites de maintenance planifiées/effectuées au titre d'un contrat. La table porte un `artisanId`
 * (double cloisonnement) mais les use-cases scopent TOUJOURS via le contrat parent du tenant
 * (anti-IDOR : une intervention n'est accessible que via son contrat possédé).
 */
export type ContratInterventionStatut = "planifiee" | "en_cours" | "effectuee" | "annulee";

export interface ContratIntervention {
  readonly id: number;
  readonly contratId: number;
  readonly artisanId: number;
  readonly titre: string;
  readonly description: string | null;
  readonly dateIntervention: Date;
  readonly duree: string | null;
  readonly technicienNom: string | null;
  readonly statut: ContratInterventionStatut;
  readonly rapport: string | null;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Création : `artisanId`/`statut` ("planifiee") posés par l'infra ; `contratId` validé (possédé). */
export interface CreateContratInterventionInput {
  readonly contratId: number;
  readonly titre: string;
  readonly dateIntervention: Date;
  readonly description?: string | null;
  readonly duree?: string | null;
  readonly technicienNom?: string | null;
  readonly notes?: string | null;
}

export interface UpdateContratInterventionInput {
  readonly titre?: string;
  readonly description?: string | null;
  readonly dateIntervention?: Date;
  readonly duree?: string | null;
  readonly technicienNom?: string | null;
  readonly statut?: ContratInterventionStatut;
  readonly rapport?: string | null;
  readonly notes?: string | null;
}

/*
 * Contrat dont l'échéance de facturation est atteinte (statut actif, `prochainFacturation` ≤ fin de
 * journée), enrichi pour l'affichage : nom client (jointure), TTC dérivé (HT × (1+TVA)), jours de retard.
 */
export interface ContratAFacturer extends Contrat {
  readonly clientNom: string;
  readonly montantTTC: string;
  readonly joursRetard: number;
}

/*
 * Update des métadonnées. ⚠️ `statut`/`reference`/`clientId` ABSENTS : statut via transitions
 * dédiées (7/9), reference immuable, clientId fixe.
 */
export interface UpdateContratInput {
  readonly titre?: string;
  readonly description?: string | null;
  readonly type?: ContratType;
  readonly montantHT?: string;
  readonly tauxTVA?: string;
  readonly periodicite?: ContratPeriodicite;
  readonly dateDebut?: Date;
  readonly dateFin?: Date | null;
  readonly reconduction?: boolean;
  readonly preavisResiliation?: number;
  readonly prochainFacturation?: Date | null;
  readonly prochainPassage?: Date | null;
  readonly conditionsParticulieres?: string | null;
  readonly notes?: string | null;
}
