import type { IAuthRepository } from "./application/auth-repository";
import type { AuthDeps } from "./application/use-cases";
import { createAuthRouter } from "./interface/trpc/auth.router";
import type { EmailPort } from "../../shared/ports/email";
import type { PasswordHasher } from "../../shared/ports/password-hasher";
import type { RateLimiterPort } from "../../shared/ports/rate-limiter";

/*
 * Wiring DI du module `auth`. ⚠️ `jwtSecret` DOIT être le même que le legacy (cookie inter-opérable).
 * `tokenTtl` par défaut 7 j. `email`/`resetRateLimiter`/`appUrl` servent le flow reset (forgotPassword).
 */
export interface AuthModuleDeps {
  readonly repository: IAuthRepository;
  readonly hasher: PasswordHasher;
  readonly jwtSecret: string;
  readonly tokenTtl?: string | number;
  readonly email?: EmailPort;
  readonly resetRateLimiter?: RateLimiterPort;
  readonly appUrl?: string;
  readonly genResetToken?: () => string;
}

export interface AuthModule {
  readonly deps: AuthDeps;
  readonly router: ReturnType<typeof createAuthRouter>;
}

export function createAuthModule(deps: AuthModuleDeps): AuthModule {
  const authDeps: AuthDeps = {
    repo: deps.repository,
    hasher: deps.hasher,
    jwtSecret: deps.jwtSecret,
    tokenTtl: deps.tokenTtl,
    email: deps.email,
    resetRateLimiter: deps.resetRateLimiter,
    appUrl: deps.appUrl,
    genResetToken: deps.genResetToken,
  };
  return { deps: authDeps, router: createAuthRouter(authDeps) };
}
