// Statistiques d'activité d'un technicien (comptes d'interventions par statut). Parité legacy
// `techniciens.getStats`. Dérivé du domaine interventions (lecture agrégée), scopé tenant.
export interface TechnicienStats {
  readonly total: number;
  readonly terminees: number;
  readonly enCours: number;
  readonly planifiees: number;
}
