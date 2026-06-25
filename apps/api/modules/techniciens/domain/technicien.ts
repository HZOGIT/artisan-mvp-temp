/*
 * Types de domaine du module techniciens (membres d'équipe de l'artisan) — découplés
 * du schéma Drizzle.
 */

export type TechnicienStatut = "actif" | "inactif" | "conge";

export interface Technicien {
  readonly id: number;
  readonly artisanId: number;
  readonly nom: string;
  readonly prenom: string | null;
  readonly email: string | null;
  readonly telephone: string | null;
  readonly specialite: string | null;
  readonly couleur: string | null;
  readonly statut: TechnicienStatut;
  readonly coutHoraire: string | null;
  readonly userId: number | null;
  readonly notes: string | null;
  /** CNIL — le technicien peut désactiver son suivi GPS hors temps de travail. */
  readonly suiviActif: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateTechnicienInput {
  readonly nom: string;
  readonly prenom?: string | null;
  readonly email?: string | null;
  readonly telephone?: string | null;
  readonly specialite?: string | null;
  readonly couleur?: string | null;
  readonly statut?: TechnicienStatut;
  readonly coutHoraire?: string | null;
  readonly userId?: number | null;
  readonly notes?: string | null;
}

export interface UpdateTechnicienInput {
  readonly nom?: string;
  readonly prenom?: string | null;
  readonly email?: string | null;
  readonly telephone?: string | null;
  readonly specialite?: string | null;
  readonly couleur?: string | null;
  readonly statut?: TechnicienStatut;
  readonly coutHoraire?: string | null;
  readonly userId?: number | null;
  readonly notes?: string | null;
}
