/*
 * Calcul du nombre de jours ouvrés d'un congé + détermination de l'année d'imputation — PUR,
 * testable sans DB.
 *
 * Règles :
 * - jours = nombre de jours ouvrés dans [dateDebut, dateFin] (sam/dim + jours fériés FR exclus),
 *   moins 0,5 par demi-journée (début/fin) ;
 * - seuls les types `conge_paye`/`rtt` impactent le solde (`soldes_conges`) ;
 * - l'imputation se fait sur **l'année de `dateDebut`** (évite la corruption inter-exercices :
 *   un congé approuvé en N et annulé en N+1 doit recréditer l'année N).
 */

export type SoldeCongeType = "conge_paye" | "rtt";

/** Le type de congé impacte-t-il le solde décompté (`soldes_conges`) ? */
export function typeAffecteSolde(type: string): type is SoldeCongeType {
  return type === "conge_paye" || type === "rtt";
}

export interface CongeDuree {
  /** YYYY-MM-DD */
  readonly dateDebut: string;
  readonly dateFin: string;
  readonly demiJourneeDebut: boolean;
  readonly demiJourneeFin: boolean;
}

export interface CalculSolde {
  readonly jours: number;
  readonly annee: number;
}

/**
 * Algorithme Meeus/Jones/Butcher pour calculer la date de Pâques.
 * Valide pour tous les ans grégoriennes (1583+).
 */
function easterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/**
 * Retourne les 11 jours fériés légaux français (fixes + mobiles basés sur Pâques)
 * sous forme de clés ISO YYYY-MM-DD.
 */
function joursFerriesFR(year: number): Set<string> {
  const feries = new Set<string>();
  const pad = (n: number) => String(n).padStart(2, "0");


  const fixes = [
    [1, 1],
    [5, 1],
    [5, 8],
    [7, 14],
    [8, 15],
    [11, 1],
    [11, 11],
    [12, 25],
  ];

  for (const [m, d] of fixes) {
    feries.add(`${year}-${pad(m)}-${pad(d)}`);
  }


  const easter = easterDate(year);
  const easterMs = easter.getTime();


  const easterMonday = new Date(easterMs + 24 * 60 * 60 * 1000);
  const m1 = pad(easterMonday.getMonth() + 1);
  const d1 = pad(easterMonday.getDate());
  feries.add(`${year}-${m1}-${d1}`);


  const ascension = new Date(easterMs + 39 * 24 * 60 * 60 * 1000);
  const m2 = pad(ascension.getMonth() + 1);
  const d2 = pad(ascension.getDate());
  feries.add(`${year}-${m2}-${d2}`);


  const pentecote = new Date(easterMs + 50 * 24 * 60 * 60 * 1000);
  const m3 = pad(pentecote.getMonth() + 1);
  const d3 = pad(pentecote.getDate());
  feries.add(`${year}-${m3}-${d3}`);

  return feries;
}

export function calculerJoursConge(conge: CongeDuree): CalculSolde {
  const debut = new Date(conge.dateDebut);
  const fin = new Date(conge.dateFin);
  let jours = 0;
  const cur = new Date(debut);
  let currentYear = debut.getFullYear();
  let feries = joursFerriesFR(currentYear);

  while (cur <= fin) {
    const newYear = cur.getFullYear();
    if (newYear !== currentYear) {
      currentYear = newYear;
      feries = joursFerriesFR(currentYear);
    }
    const iso = cur.toISOString().slice(0, 10);
    if (cur.getDay() !== 0 && cur.getDay() !== 6 && !feries.has(iso)) jours++;
    cur.setDate(cur.getDate() + 1);
  }
  if (conge.demiJourneeDebut) jours -= 0.5;
  if (conge.demiJourneeFin) jours -= 0.5;
  return { jours, annee: debut.getFullYear() };
}
