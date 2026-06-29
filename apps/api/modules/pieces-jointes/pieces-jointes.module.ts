import type { IPiecesJointesRepository } from "./application/pieces-jointes-repository";
import type { StoragePort } from "../../shared/ports/storage";
import { createPiecesJointesRouter } from "./interface/trpc/pieces-jointes.router";

export interface PiecesJointesModuleDeps {
  readonly repository: IPiecesJointesRepository;
  readonly storage: StoragePort;
}

export interface PiecesJointesModule {
  readonly deps: PiecesJointesModuleDeps;
  readonly router: ReturnType<typeof createPiecesJointesRouter>;
}

export function createPiecesJointesModule(deps: PiecesJointesModuleDeps): PiecesJointesModule {
  return {
    deps,
    router: createPiecesJointesRouter(deps.repository, deps.storage),
  };
}
