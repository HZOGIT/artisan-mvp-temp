import type { DbClient } from "../../shared/db";
import type { IModeleEmailRepository } from "./application/modele-email-repository";
import { createModelesEmailRouter } from "./interface/trpc/modeles-email.router";

/*
 * Wiring DI du module modeles-email : assemble le routeur tRPC (CRUD + byType) à partir du
 * repository injecté.
 */
export interface ModelesEmailModuleDeps {
  readonly repository: IModeleEmailRepository;
  /** Pool DB pour les transactions outbox events (défaut : sans outbox). */
  readonly db?: DbClient;
}

export interface ModelesEmailModule {
  readonly deps: ModelesEmailModuleDeps;
  readonly router: ReturnType<typeof createModelesEmailRouter>;
}

export function createModelesEmailModule(deps: ModelesEmailModuleDeps): ModelesEmailModule {
  return { deps, router: createModelesEmailRouter(deps.repository, deps.db) };
}
