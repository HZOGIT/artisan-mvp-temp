// Utilisateur du tenant liable à une fiche technicien (sélecteur de formulaire).
// Lecture légère scopée tenant (id/nom/email/rôle). La table `users` n'est PAS sous RLS
// tenant (denylist auth) → le scope repose sur un filtre artisanId EXPLICITE.
export interface UtilisateurLiable {
  readonly id: number;
  readonly nom: string;
  readonly email: string | null;
  readonly role: string;
}
