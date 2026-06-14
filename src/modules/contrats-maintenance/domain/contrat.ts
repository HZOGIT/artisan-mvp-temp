// Types de domaine du module contrats-maintenance (contrats récurrents de maintenance/entretien
// d'un client) — découplés du schéma Drizzle. Table `contrats_maintenance` (RLS sur artisanId).
// ⚠️ Domaine semi-sensible financier : montants HT/TVA, `reference` générée serveur, `clientId`
// anti-IDOR-FK, statut initial "actif" non usurpable, transitions de statut maîtrisées.

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
  readonly montantHT: string; // numeric PG en string
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

// Entrée de création : `reference` est générée serveur (jamais fournie) ; `statut` ("actif") est
// posé par l'infra. `clientId` est validé (anti-IDOR) au use-case.
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

// Update des métadonnées. ⚠️ `statut`/`reference`/`clientId` ABSENTS : statut via transitions
// dédiées (7/9), reference immuable, clientId fixe.
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
