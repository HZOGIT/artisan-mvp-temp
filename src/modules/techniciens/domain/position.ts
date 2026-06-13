// Position GPS d'un technicien. La table `positions_techniciens` n'a PAS d'artisanId →
// l'isolation passe par l'appartenance du technicien au tenant (anti-IDOR géoloc).
// Coordonnées en string (numeric PG) pour préserver la précision.

export interface Position {
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
}

export interface EnregistrerPositionInput {
  readonly latitude: string;
  readonly longitude: string;
  readonly precision?: number | null;
  readonly vitesse?: string | null;
  readonly cap?: number | null;
  readonly batterie?: number | null;
  readonly enDeplacement?: boolean;
  readonly interventionEnCoursId?: number | null;
}
