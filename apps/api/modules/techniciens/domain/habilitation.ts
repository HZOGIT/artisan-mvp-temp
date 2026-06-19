/*
 * Habilitation / certification BTP d'un technicien — données salarié sensibles.
 * L'isolation passe par l'appartenance du technicien (et l'artisanId de la ligne) au tenant.
 * `date*` = colonnes `date` PG → string (YYYY-MM-DD) | null ; `createdAt` = timestamp.
 */
export interface HabilitationTechnicien {
  readonly id: number;
  readonly technicienId: number;
  readonly type: string;
  readonly numero: string | null;
  readonly organisme: string | null;
  readonly dateObtention: string | null;
  readonly dateExpiration: string | null;
  readonly createdAt: Date;
}

export interface AjouterHabilitationInput {
  readonly type: string;
  readonly numero?: string | null;
  readonly organisme?: string | null;
  /** Dates ISO `YYYY-MM-DD` ; une valeur invalide est ignorée (→ null) côté use-case. */
  readonly dateObtention?: string | null;
  readonly dateExpiration?: string | null;
}
