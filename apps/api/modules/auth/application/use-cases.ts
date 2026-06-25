import { createHash, randomBytes } from "node:crypto";
import { ConflictError, UnauthorizedError, ValidationError } from "../../../shared/errors";
import type { EmailPort } from "../../../shared/ports/email";
import type { PasswordHasher } from "../../../shared/ports/password-hasher";
import type { RateLimiterPort } from "../../../shared/ports/rate-limiter";
import { signAuthToken } from "../../../shared/tenant/jwt";
import type { TokenClaims } from "../../../shared/tenant";
import { resetPasswordEmail, welcomeEmail } from "./emails";
import type { AuthMe, AuthUser } from "../domain/auth";
import type { IAuthRepository } from "./auth-repository";

/** Dépendances du module auth (injectables/testables). */
export interface AuthDeps {
  readonly repo: IAuthRepository;
  readonly hasher: PasswordHasher;
  readonly jwtSecret: string;
  /** défaut 7j (parité legacy) */
  readonly tokenTtl?: string | number;
  readonly email?: EmailPort;
  /** Rate-limiter de la demande de reset (clé = email) ; anti-flood. Optionnel. */
  readonly resetRateLimiter?: RateLimiterPort;
  /** Base URL de confiance pour le lien de reset (JAMAIS l'Origin) — parité legacy APP_URL. */
  readonly appUrl?: string;
  /** Génère le jeton de reset brut (défaut : 32 octets hex). Injectable (déterminisme test). */
  readonly genResetToken?: () => string;
}

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");
const defaultResetToken = (): string => randomBytes(32).toString("hex");

/*
 * Utilisateur courant (depuis les claims du cookie) + permissions. Renvoie null si non authentifié,
 * utilisateur introuvable, ou **désactivé** (parité legacy `getUserFromRequest` : bloque les inactifs).
 */
export async function me(repo: IAuthRepository, claims: TokenClaims | null, permissions: readonly string[]): Promise<AuthMe | null> {
  if (!claims) return null;
  const user = await repo.getById(claims.userId);
  if (!user || user.actif === false) return null;
  return { ...user, permissions: [...permissions] };
}

/*
 * Authentifie email+mot de passe (bcrypt), met à jour lastSignedIn, et renvoie l'utilisateur + un JWT
 * signé (à poser en cookie par l'interface). Identifiants invalides / sans mot de passe → 401.
 */
export async function signin(deps: AuthDeps, input: { email: string; password: string }): Promise<{ user: AuthUser; token: string }> {
  const cred = await deps.repo.findCredentials(input.email);
  if (!cred || !cred.password) {
    throw new UnauthorizedError("Invalid email or password");
  }
  if (!(await deps.hasher.verify(input.password, cred.password))) {
    throw new UnauthorizedError("Invalid email or password");
  }
  await deps.repo.touchLastSignedIn(cred.id);
  const token = await signAuthToken({ userId: cred.id, email: cred.email ?? "" }, deps.jwtSecret, deps.tokenTtl ?? "7d");
  const user = await deps.repo.getById(cred.id);
  if (!user) throw new UnauthorizedError("Invalid email or password");
  return { user, token };
}

/*
 * Inscription : email unique (409) → hash bcrypt → création user → **bootstrap** (artisan + essai +
 * permissions owner) → JWT + (cookie posé par l'interface). Email de bienvenue best-effort. Parité legacy.
 */
export async function signup(deps: AuthDeps, input: { email: string; password: string; name?: string }): Promise<{ user: AuthUser; token: string }> {
  if ((await deps.repo.findIdByEmail(input.email)) !== null) {
    throw new ConflictError("Email already in use");
  }
  const passwordHash = await deps.hasher.hash(input.password);
  const created = await deps.repo.createUser({ email: input.email, passwordHash, name: input.name ?? null });
  /** Provisionne le compte (artisan + abonnement d'essai + permissions owner) — requis pour utiliser l'app. */
  await deps.repo.bootstrapAccount(created.id);
  const token = await signAuthToken({ userId: created.id, email: created.email ?? input.email }, deps.jwtSecret, deps.tokenTtl ?? "7d");
  if (deps.email) {
    try {
      await deps.email.send({ to: input.email, subject: "Bienvenue sur Operioz ! 🎉", body: welcomeEmail(input.name, deps.appUrl) });
    } catch {
      /* best-effort */
    }
  }
  const user = (await deps.repo.getById(created.id)) ?? { id: created.id, email: created.email, name: input.name ?? null, prenom: null, role: "artisan", artisanId: null, actif: true };
  return { user, token };
}

/** Modifie l'email de l'utilisateur courant. Conflit si l'email est déjà pris par un AUTRE utilisateur (409). */
export async function updateEmail(deps: AuthDeps, userId: number, newEmail: string): Promise<{ success: true }> {
  const existing = await deps.repo.findIdByEmail(newEmail);
  if (existing !== null && existing !== userId) {
    throw new ConflictError("Email déjà utilisé");
  }
  await deps.repo.updateEmail(userId, newEmail);
  return { success: true };
}

/** Change le mot de passe : vérifie l'ancien (bcrypt) puis hashe le nouveau. Parité legacy. */
export async function updatePassword(deps: AuthDeps, userId: number, currentPassword: string, newPassword: string): Promise<{ success: true }> {
  const cred = await deps.repo.findCredentialsById(userId);
  if (!cred || !cred.password) {
    throw new ValidationError("Aucun mot de passe configuré sur ce compte");
  }
  if (!(await deps.hasher.verify(currentPassword, cred.password))) {
    throw new UnauthorizedError("Mot de passe actuel incorrect");
  }
  await deps.repo.updatePassword(userId, await deps.hasher.hash(newPassword));
  await deps.repo.bumpPasswordChangedAt(userId);
  return { success: true };
}

/*
 * Demande de reset : génère un jeton (envoyé par email), stocke son HASH SHA-256 + expiry 1h. RÉPONSE
 * TOUJOURS `{success:true}` (anti-énumération : ne révèle JAMAIS si l'email existe). Anti-flood best-effort.
 */
export async function forgotPassword(deps: AuthDeps, email: string): Promise<{ success: true }> {
  const key = email.toLowerCase().trim();
  /** Au-delà du seuil, on renvoie le même success sans rien faire (réponse constante préservée). */
  if (deps.resetRateLimiter && !(await deps.resetRateLimiter.check(`reset:${key}`))) {
    return { success: true };
  }
  const cred = await deps.repo.findCredentials(email);
  /** Uniquement les comptes actifs disposant d'un mot de passe (les comptes OAuth-only n'en ont pas). */
  if (cred && cred.actif !== false && cred.password) {
    const rawToken = (deps.genResetToken ?? defaultResetToken)();
    const tokenHash = sha256(rawToken);
    /** 1h */
    const expiry = new Date(Date.now() + 60 * 60 * 1000);
    await deps.repo.setResetToken(cred.id, tokenHash, expiry);
    if (deps.email) {
      const baseUrl = deps.appUrl || "https://www.operioz.com";
      const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;
      try {
        await deps.email.send({ to: email, subject: "Réinitialisation de votre mot de passe Operioz", body: resetPasswordEmail(resetUrl) });
      } catch {
        /* best-effort : ne révèle rien, ne bloque pas */
      }
    }
  }
  return { success: true };
}

/*
 * Applique un nouveau mot de passe à partir d'un jeton valide (hash recherché + non expiré), puis
 * invalide le jeton. Jeton invalide/expiré → 400 (parité legacy).
 */
export async function resetPassword(deps: AuthDeps, token: string, newPassword: string): Promise<{ success: true }> {
  const user = await deps.repo.findByValidResetToken(sha256(token));
  if (!user) {
    throw new ValidationError("Lien invalide ou expiré. Veuillez refaire une demande.");
  }
  await deps.repo.resetPasswordWithToken(user.id, await deps.hasher.hash(newPassword));
  await deps.repo.bumpPasswordChangedAt(user.id);
  return { success: true };
}

/** Invalide toutes les sessions actives (bump `passwordChangedAt`) sans changer le mot de passe. */
export async function logoutEverywhere(deps: AuthDeps, userId: number): Promise<{ success: true }> {
  await deps.repo.bumpPasswordChangedAt(userId);
  return { success: true };
}

/** Suppression de compte (SOFT-delete : actif=false + email neutralisé réutilisable). Confirmation requise. */
export async function deleteAccount(deps: AuthDeps, userId: number, confirmation: string): Promise<{ success: true }> {
  if (confirmation !== "SUPPRIMER") {
    throw new ValidationError("Confirmation incorrecte");
  }
  await deps.repo.softDelete(userId, `deleted_${userId}_${Date.now()}@operioz.com`);
  return { success: true };
}
