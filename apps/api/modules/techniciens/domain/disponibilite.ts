/*
 * Disponibilité hebdomadaire d'un technicien (un créneau par jour de semaine).
 * La table `disponibilites_techniciens` n'a PAS d'artisanId → l'isolation passe par
 * l'appartenance du technicien au tenant (anti-IDOR).
 */

export interface Disponibilite {
  readonly id: number;
  readonly technicienId: number;
  /** 0 (dimanche) .. 6 (samedi) */
  readonly jourSemaine: number;
  /** "HH:MM" */
  readonly heureDebut: string;
  /** "HH:MM" */
  readonly heureFin: string;
  readonly disponible: boolean;
}

export interface SetDisponibiliteInput {
  readonly jourSemaine: number;
  readonly heureDebut: string;
  readonly heureFin: string;
  readonly disponible: boolean;
}
