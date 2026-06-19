import type { IArtisanRepository } from "./application/artisan-repository";
import { createArtisanRouter } from "./interface/trpc/artisan.router";

/*
 * Wiring DI du module artisan (profil entreprise du tenant) : assemble le routeur tRPC à partir du
 * repository injecté.
 */
export interface ArtisanModuleDeps {
  readonly repository: IArtisanRepository;
}

export interface ArtisanModule {
  readonly deps: ArtisanModuleDeps;
  readonly router: ReturnType<typeof createArtisanRouter>;
}

export function createArtisanModule(deps: ArtisanModuleDeps): ArtisanModule {
  return { deps, router: createArtisanRouter(deps.repository) };
}
