import { UnauthorizedError } from "../../../shared/errors";
import type { PasswordHasher } from "../../../shared/ports/password-hasher";
import { signAuthToken } from "../../../shared/tenant/jwt";
import type { TokenClaims } from "../../../shared/tenant";
import type { AuthMe, AuthUser } from "../domain/auth";
import type { IAuthRepository } from "./auth-repository";

// Dépendances du module auth (injectables/testables).
export interface AuthDeps {
  readonly repo: IAuthRepository;
  readonly hasher: PasswordHasher;
  readonly jwtSecret: string;
  readonly tokenTtl?: string | number; // défaut 7j (parité legacy)
}

// Utilisateur courant (depuis les claims du cookie) + permissions. Renvoie null si non authentifié,
// utilisateur introuvable, ou **désactivé** (parité legacy `getUserFromRequest` : bloque les inactifs).
export async function me(repo: IAuthRepository, claims: TokenClaims | null, permissions: readonly string[]): Promise<AuthMe | null> {
  if (!claims) return null;
  const user = await repo.getById(claims.userId);
  if (!user || user.actif === false) return null;
  return { ...user, permissions: [...permissions] };
}

// Authentifie email+mot de passe (bcrypt), met à jour lastSignedIn, et renvoie l'utilisateur + un JWT
// signé (à poser en cookie par l'interface). Identifiants invalides / sans mot de passe → 401.
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
