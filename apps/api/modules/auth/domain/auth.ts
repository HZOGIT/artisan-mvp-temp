/*
 * Domaine `auth` : authentification par email/mot de passe (tables `users` — HORS RLS) + émission JWT
 * (cookie `token`). ⚠️ SENSIBLE : un bug = lockout. Hash bcrypt (PasswordHasher), claims JWT `{userId,email}`.
 */

// Utilisateur exposé par `me`/`signin` (jamais le hash de mot de passe).
export interface AuthUser {
  readonly id: number;
  readonly email: string | null;
  readonly name: string | null;
  readonly prenom: string | null;
  readonly role: string;
  readonly artisanId: number | null;
  readonly actif: boolean;
}

// Réponse de `me` : l'utilisateur courant + ses permissions (parité legacy : `ctx.user` enrichi).
export interface AuthMe extends AuthUser {
  readonly permissions: string[];
}

// Identifiants internes pour la vérification du mot de passe (inclut le hash — jamais exposé au client).
export interface AuthCredentials {
  readonly id: number;
  readonly email: string | null;
  readonly password: string | null;
  readonly actif: boolean;
}
