import type { AuthCredentials, AuthUser } from "../domain/auth";

// Port du repository `auth` (table `users`, HORS RLS → accès par id/email, jamais scopé tenant : un
// utilisateur s'authentifie AVANT d'avoir un tenant résolu). Lecture/écriture minimale d'auth.
export interface IAuthRepository {
  // Identifiants (avec hash) pour la vérification du mot de passe au login ; null si email inconnu.
  findCredentials(email: string): Promise<AuthCredentials | null>;
  // Utilisateur complet (sans hash) par id — pour `me` ; null si introuvable.
  getById(userId: number): Promise<AuthUser | null>;
  // Met à jour `lastSignedIn` après un login réussi.
  touchLastSignedIn(userId: number): Promise<void>;
}
