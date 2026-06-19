import { randomBytes } from "node:crypto";
import type { EmailPort } from "../../shared/ports/email";
import type { PasswordHasher } from "../../shared/ports/password-hasher";
import type { IUtilisateurRepository } from "./application/utilisateur-repository";
import type { UtilisateurDeps } from "./application/use-cases";
import { createUtilisateursRouter } from "./interface/trpc/utilisateurs.router";

/** Générateur de MDP temporaire par défaut : 10 caractères alphanumériques, RNG crypto-sûr (parité legacy). */
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
export const defaultTempPassword = (): string => Array.from(randomBytes(10), (b) => ALPHABET[b % 36]).join("");

export interface UtilisateursModuleDeps {
  readonly repository: IUtilisateurRepository;
  readonly hasher: PasswordHasher;
  readonly email: EmailPort;
  readonly genTempPassword?: () => string;
}

export interface UtilisateursModule {
  readonly deps: UtilisateurDeps;
  readonly router: ReturnType<typeof createUtilisateursRouter>;
}

export function createUtilisateursModule(deps: UtilisateursModuleDeps): UtilisateursModule {
  const ucDeps: UtilisateurDeps = {
    repo: deps.repository,
    hasher: deps.hasher,
    email: deps.email,
    genTempPassword: deps.genTempPassword ?? defaultTempPassword,
  };
  return { deps: ucDeps, router: createUtilisateursRouter(ucDeps) };
}
