/*
 * RDV en ligne + suivi de chantier côté portail client. Le calcul des créneaux libres et la validation
 * de la date proposée sont PURS (parité legacy `getCreneauxDisponibles` / `demanderRdv`).
 */

export interface CreneauOccupe {
  readonly dateDebut: Date;
  readonly dateFin: Date | null;
}

const HEURE_DEBUT = 8;
/** exclusif (derniers créneaux débutent à 17h) */
const HEURE_FIN = 18;
/** un créneau au plus tôt à +24h */
const FENETRE_MIN_MS = 24 * 60 * 60 * 1000;
const FENETRE_MAX_JOURS = 14;
const SLOT_MS = 60 * 60 * 1000;

/*
 * Créneaux libres ISO sur [now+24h, now+14j], jours ouvrés (lun-ven), 8h→17h, pas 1h, hors occupations
 * (chevauchement strict). PUR (parité legacy `getCreneauxDisponibles`).
 */
export function computeCreneauxLibres(occupied: readonly CreneauOccupe[], now: Date): string[] {
  const debut = new Date(now.getTime() + FENETRE_MIN_MS);
  const fin = new Date(now.getTime() + FENETRE_MAX_JOURS * 24 * 60 * 60 * 1000);
  const slots: string[] = [];
  const current = new Date(debut);
  current.setHours(0, 0, 0, 0);

  while (current <= fin) {
    const jour = current.getDay();
    if (jour >= 1 && jour <= 5) {
      for (let hour = HEURE_DEBUT; hour < HEURE_FIN; hour++) {
        const slotStart = new Date(current);
        slotStart.setHours(hour, 0, 0, 0);
        const slotEnd = new Date(slotStart.getTime() + SLOT_MS);
        if (slotStart <= debut) continue;
        const occupe = occupied.some((occ) => {
          const occEnd = occ.dateFin || new Date(occ.dateDebut.getTime() + SLOT_MS);
          return slotStart < occEnd && slotEnd > occ.dateDebut;
        });
        if (!occupe) slots.push(slotStart.toISOString());
      }
    }
    current.setDate(current.getDate() + 1);
  }
  return slots;
}

export type RdvDateValidite = "ok" | "invalide" | "trop_tot" | "trop_loin";

/** Valide la date proposée d'un RDV (parité legacy : NaN, < +24h, > +2 ans). PUR. */
export function validerDateRdv(dateProposee: Date, now: Date): RdvDateValidite {
  if (isNaN(dateProposee.getTime())) return "invalide";
  if (dateProposee < new Date(now.getTime() + FENETRE_MIN_MS)) return "trop_tot";
  if (dateProposee > new Date(now.getTime() + 2 * 365 * 24 * 60 * 60 * 1000)) return "trop_loin";
  return "ok";
}
