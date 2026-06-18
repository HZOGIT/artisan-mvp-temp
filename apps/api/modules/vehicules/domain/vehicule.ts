// Types de domaine du module vehicules — découplés du schéma Drizzle (le mapping
// est fait dans l'adapter infra). Les *Input de création n'incluent JAMAIS artisanId :
// il est forcé depuis le TenantContext (anti-injection cross-tenant).

export type TypeCarburant = "essence" | "diesel" | "electrique" | "hybride" | "gpl";
export type StatutVehicule = "actif" | "en_maintenance" | "hors_service" | "vendu";
export type TypeEntretien =
  | "vidange"
  | "pneus"
  | "freins"
  | "controle_technique"
  | "revision"
  | "reparation"
  | "autre";
export type TypeAssurance = "tiers" | "tiers_plus" | "tous_risques";

export interface Vehicule {
  readonly id: number;
  readonly artisanId: number;
  readonly immatriculation: string;
  readonly marque: string | null;
  readonly modele: string | null;
  readonly annee: number | null;
  readonly typeCarburant: TypeCarburant;
  readonly puissanceFiscale: number | null;
  readonly kilometrageActuel: number;
  readonly dateAchat: string | null;
  readonly prixAchat: string | null;
  readonly technicienId: number | null;
  readonly statut: StatutVehicule;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateVehiculeInput {
  readonly immatriculation: string;
  readonly marque?: string | null;
  readonly modele?: string | null;
  readonly annee?: number | null;
  readonly typeCarburant?: TypeCarburant;
  readonly puissanceFiscale?: number | null;
  readonly kilometrageActuel?: number;
  readonly dateAchat?: string | null;
  readonly prixAchat?: string | null;
  readonly technicienId?: number | null;
  readonly statut?: StatutVehicule;
  readonly notes?: string | null;
}

export type UpdateVehiculeInput = Partial<CreateVehiculeInput>;

export interface EntretienVehicule {
  readonly id: number;
  readonly vehiculeId: number;
  readonly type: TypeEntretien;
  readonly dateEntretien: string;
  readonly kilometrageEntretien: number | null;
  readonly cout: string | null;
  readonly prestataire: string | null;
  readonly description: string | null;
  readonly prochainEntretienKm: number | null;
  readonly prochainEntretienDate: string | null;
  readonly facture: string | null;
  readonly createdAt: Date;
}

export interface CreateEntretienInput {
  readonly type: TypeEntretien;
  readonly dateEntretien: string;
  readonly kilometrageEntretien?: number | null;
  readonly cout?: string | null;
  readonly prestataire?: string | null;
  readonly description?: string | null;
  readonly prochainEntretienKm?: number | null;
  readonly prochainEntretienDate?: string | null;
  readonly facture?: string | null;
}

export interface AssuranceVehicule {
  readonly id: number;
  readonly vehiculeId: number;
  readonly compagnie: string;
  readonly numeroContrat: string | null;
  readonly typeAssurance: TypeAssurance;
  readonly dateDebut: string;
  readonly dateFin: string;
  readonly primeAnnuelle: string | null;
  readonly franchise: string | null;
  readonly document: string | null;
  readonly alerteEnvoyee: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateAssuranceInput {
  readonly compagnie: string;
  readonly numeroContrat?: string | null;
  readonly typeAssurance?: TypeAssurance;
  readonly dateDebut: string;
  readonly dateFin: string;
  readonly primeAnnuelle?: string | null;
  readonly franchise?: string | null;
  readonly document?: string | null;
}

export interface ReleveKilometrage {
  readonly id: number;
  readonly vehiculeId: number;
  readonly technicienId: number | null;
  readonly kilometrage: number;
  readonly dateReleve: string;
  readonly motif: string | null;
  readonly createdAt: Date;
}

export interface CreateKilometrageInput {
  readonly kilometrage: number;
  readonly dateReleve: string;
  readonly motif?: string | null;
  readonly technicienId?: number | null;
}

export interface StatistiquesFlotte {
  readonly nbVehicules: number;
  readonly nbActifs: number;
  readonly nbEnMaintenance: number;
  readonly kmTotalFlotte: number;
  readonly coutEntretienAnneeEnCours: number;
  readonly assurancesAExpirer: number;
}
