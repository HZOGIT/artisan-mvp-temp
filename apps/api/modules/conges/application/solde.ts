// Calcul du nombre de jours d'un congé + détermination de l'année d'imputation — PUR,
// testable sans DB. ⚠️ Parité legacy stricte (montants de solde RH).
//
// Règles (parité legacy `congesRouter.approuver`/`annuler`) :
// - jours = ceil(|dateFin − dateDebut| en jours) + 1 (bornes incluses), moins 0,5 par
//   demi-journée (début/fin) ;
// - seuls les types `conge_paye`/`rtt` impactent le solde (`soldes_conges`) ;
// - l'imputation se fait sur **l'année de `dateDebut`** (évite la corruption inter-exercices :
//   un congé approuvé en N et annulé en N+1 doit recréditer l'année N).

export type SoldeCongeType = "conge_paye" | "rtt";

// Le type de congé impacte-t-il le solde décompté (`soldes_conges`) ?
export function typeAffecteSolde(type: string): type is SoldeCongeType {
  return type === "conge_paye" || type === "rtt";
}

export interface CongeDuree {
  readonly dateDebut: string; // YYYY-MM-DD
  readonly dateFin: string;
  readonly demiJourneeDebut: boolean;
  readonly demiJourneeFin: boolean;
}

export interface CalculSolde {
  readonly jours: number;
  readonly annee: number;
}

const MS_PAR_JOUR = 1000 * 60 * 60 * 24;

export function calculerJoursConge(conge: CongeDuree): CalculSolde {
  const debut = new Date(conge.dateDebut);
  const fin = new Date(conge.dateFin);
  let jours = Math.ceil(Math.abs(fin.getTime() - debut.getTime()) / MS_PAR_JOUR) + 1;
  if (conge.demiJourneeDebut) jours -= 0.5;
  if (conge.demiJourneeFin) jours -= 0.5;
  return { jours, annee: debut.getFullYear() };
}
