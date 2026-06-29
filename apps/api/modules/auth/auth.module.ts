import type { IAuthRepository } from "./application/auth-repository";
import type { AuthDeps } from "./application/use-cases";
import { createAuthRouter } from "./interface/trpc/auth.router";
import type { EmailPort } from "../../shared/ports/email";
import type { PasswordHasher } from "../../shared/ports/password-hasher";
import type { RateLimiterPort } from "../../shared/ports/rate-limiter";
import type { IEmailOptoutRepository } from "../emails/application/email-optout-repository";

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
  readonly signinRateLimiter?: RateLimiterPort;
  readonly signupRateLimiter?: RateLimiterPort;
  readonly resetRateLimiter?: RateLimiterPort;
  readonly appUrl?: string;
  readonly genResetToken?: () => string;
  readonly optoutRepo?: IEmailOptoutRepository;
  readonly unsubscribeSecret?: string;
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
    signinRateLimiter: deps.signinRateLimiter,
    signupRateLimiter: deps.signupRateLimiter,
    resetRateLimiter: deps.resetRateLimiter,
    appUrl: deps.appUrl,
    genResetToken: deps.genResetToken,
    optoutRepo: deps.optoutRepo,
    unsubscribeSecret: deps.unsubscribeSecret,
  };
  return { deps: authDeps, router: createAuthRouter(authDeps) };
}
