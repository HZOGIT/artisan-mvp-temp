import type { IAuthRepository } from "./application/auth-repository";
import type { AuthDeps } from "./application/use-cases";
import { createAuthRouter } from "./interface/trpc/auth.router";
import type { PasswordHasher } from "../../shared/ports/password-hasher";

// Wiring DI du module `auth` (slice session). ⚠️ `jwtSecret` DOIT être le même que le legacy (cookie
// inter-opérable). `tokenTtl` par défaut 7 j.
export interface AuthModuleDeps {
  readonly repository: IAuthRepository;
  readonly hasher: PasswordHasher;
  readonly jwtSecret: string;
  readonly tokenTtl?: string | number;
}

export interface AuthModule {
  readonly deps: AuthDeps;
  readonly router: ReturnType<typeof createAuthRouter>;
}

export function createAuthModule(deps: AuthModuleDeps): AuthModule {
  const authDeps: AuthDeps = { repo: deps.repository, hasher: deps.hasher, jwtSecret: deps.jwtSecret, tokenTtl: deps.tokenTtl };
  return { deps: authDeps, router: createAuthRouter(authDeps) };
}
