/*
 * Dernière position GPS d'un technicien (table `positions_techniciens`, SANS artisanId → l'isolation
 * est portée par l'appartenance du technicien parent). Données RGPD : lecture seule, scopée tenant.
 */
export interface PositionPoint {
  readonly id: number;
  readonly technicienId: number;
  readonly latitude: string;
  readonly longitude: string;
  readonly precision: number | null;
  readonly vitesse: string | null;
  readonly cap: number | null;
  readonly batterie: number | null;
  readonly enDeplacement: boolean;
  readonly interventionEnCoursId: number | null;
  readonly timestamp: Date;
  readonly createdAt: Date;
}

// Technicien du tenant enrichi de sa dernière position (null si aucune). Forme renvoyée par `getPositions`.
export interface TechnicienAvecPosition {
  readonly id: number;
  readonly nom: string;
  readonly prenom: string | null;
  readonly email: string | null;
  readonly telephone: string | null;
  readonly specialite: string | null;
  readonly couleur: string | null;
  readonly position: PositionPoint | null;
}
