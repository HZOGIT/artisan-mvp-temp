import type { AuthCredentials, AuthUser } from "../domain/auth";

/*
 * Port du repository `auth` (table `users`, HORS RLS → accès par id/email, jamais scopé tenant : un
 * utilisateur s'authentifie AVANT d'avoir un tenant résolu). Lecture/écriture minimale d'auth.
 */
export interface IAuthRepository {
  /** Identifiants (avec hash) pour la vérification du mot de passe au login ; null si email inconnu. */
  findCredentials(email: string): Promise<AuthCredentials | null>;
  /** Utilisateur complet (sans hash) par id — pour `me` ; null si introuvable. */
  getById(userId: number): Promise<AuthUser | null>;
  /** Met à jour `lastSignedIn` après un login réussi. */
  touchLastSignedIn(userId: number): Promise<void>;
  /** Identifiants (avec hash + statut actif) par id — pour la vérification de l'ancien MDP (updatePassword). */
  findCredentialsById(userId: number): Promise<AuthCredentials | null>;
  /** Email déjà utilisé par UN AUTRE utilisateur ? (unicité à la modification d'email). null si libre. */
  findIdByEmail(email: string): Promise<number | null>;
  /** Met à jour l'email de l'utilisateur. */
  updateEmail(userId: number, email: string): Promise<void>;
  /** Met à jour le hash du mot de passe. */
  updatePassword(userId: number, passwordHash: string): Promise<void>;
  /** Pose le jeton de reset (hash + expiry) sur un utilisateur. */
  setResetToken(userId: number, tokenHash: string, expiry: Date): Promise<void>;
  /** Utilisateur dont le jeton de reset (hash) est valide (non expiré) ; null sinon. */
  findByValidResetToken(tokenHash: string): Promise<{ id: number } | null>;
  /** Applique un nouveau mot de passe ET invalide le jeton de reset (atomique côté impl). */
  resetPasswordWithToken(userId: number, passwordHash: string): Promise<void>;
  /** Soft-delete : `actif=false` + email neutralisé (réutilisable). */
  softDelete(userId: number, neutralizedEmail: string): Promise<void>;
  /** Lit la date du dernier changement de mot de passe (révocation de tokens antérieurs). null si jamais changé. */
  getPasswordChangedAt(userId: number): Promise<Date | null>;
  /** Set `passwordChangedAt = now()` — invalide tous les tokens JWT émis avant cet instant. */
  bumpPasswordChangedAt(userId: number): Promise<void>;
  /** Crée un utilisateur (signup) : email + hash + name, loginMethod 'email'. Renvoie l'identité. */
  createUser(data: { email: string; passwordHash: string; name?: string | null; registrationIp?: string | null }): Promise<{ id: number; email: string | null }>;
  /*
   * Provisionne le compte propriétaire (idempotent, parité `bootstrapArtisanAccount`) : artisan + lien
   * `users.artisanId` + abonnement d'essai 14 j (si absent) + permissions owner = toutes (si absentes).
   */
  bootstrapAccount(userId: number): Promise<void>;
  /**
   * Effacement RGPD Art. 17 — supprime ou pseudonymise les données personnelles du compte :
   * clients sans facture supprimés, clients avec facture pseudonymisés, conversations/messages/RDV
   * supprimés, PII artisan effacée. Pose `pendingDeletionAt` pour le job de purge différé 30j.
   */
  purgePersonalData(userId: number): Promise<void>;
}
