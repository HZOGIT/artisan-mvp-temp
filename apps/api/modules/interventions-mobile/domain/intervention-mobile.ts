/*
 * Données « terrain » d'une intervention saisies depuis l'app mobile technicien (parité legacy
 * `interventions_mobile`) : heures d'arrivée/départ, géoloc, notes, signature client. Table SOUS RLS.
 */
export interface InterventionMobile {
  readonly id: number;
  readonly interventionId: number;
  readonly latitude: string | null;
  readonly longitude: string | null;
  readonly heureArrivee: Date | null;
  readonly heureDepart: Date | null;
  readonly notesIntervention: string | null;
  readonly signatureClient: string | null;
  readonly signatureDate: Date | null;
}

/*
 * Bornes [début de journée, début du lendemain) pour « les interventions du jour » (parité legacy :
 * `date >= today(00:00) && date < tomorrow(00:00)`). PUR.
 */
export function bornesDuJour(now: Date): { debut: Date; fin: Date } {
  const debut = new Date(now);
  debut.setHours(0, 0, 0, 0);
  const fin = new Date(debut);
  fin.setDate(fin.getDate() + 1);
  return { debut, fin };
}
