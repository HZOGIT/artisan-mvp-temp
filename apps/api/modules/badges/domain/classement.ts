// Types de domaine du classement des techniciens (gamification) — découplés Drizzle.

export type PeriodeClassement = "semaine" | "mois" | "trimestre" | "annee";

// Une ligne de classement (technicien classé sur une période). Montants en string
// (numeric PG) pour préserver la précision. Scopé tenant (artisanId + RLS).
export interface ClassementEntry {
  readonly id: number;
  readonly technicienId: number;
  readonly artisanId: number;
  readonly periode: PeriodeClassement;
  readonly dateDebut: string;
  readonly dateFin: string;
  readonly rang: number;
  readonly pointsTotal: number;
  readonly interventions: number;
  readonly ca: string;
  readonly noteMoyenne: string | null;
  readonly createdAt: Date;
}
