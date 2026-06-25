import type { IArtisanRepository } from "./application/artisan-repository";
import type { IAuthRepository } from "../auth/application/auth-repository";
import type { PasswordHasher } from "../../shared/ports/password-hasher";
import type { EmailPort } from "../../shared/ports/email";
import { createArtisanRouter } from "./interface/trpc/artisan.router";

/*
 * Wiring DI du module artisan (profil entreprise du tenant) : assemble le routeur tRPC à partir du
 * repository injecté. `authRepo` + `hasher` requis pour la ré-auth IBAN ; `email` best-effort.
 */
export interface ArtisanModuleDeps {
  readonly repository: IArtisanRepository;
  readonly authRepo: IAuthRepository;
  readonly hasher: PasswordHasher;
  readonly email?: EmailPort;
}

export interface ArtisanModule {
  readonly deps: ArtisanModuleDeps;
  readonly router: ReturnType<typeof createArtisanRouter>;
}

export function createArtisanModule(deps: ArtisanModuleDeps): ArtisanModule {
  return { deps, router: createArtisanRouter(deps.repository, { authRepo: deps.authRepo, hasher: deps.hasher, email: deps.email }) };
}
