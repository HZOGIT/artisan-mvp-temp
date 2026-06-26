import type { DbClient } from "../../shared/db";
import type { INoteDeFraisRepository } from "./application/note-de-frais-repository";
import { createNotesDeFraisRouter } from "./interface/trpc/notes-de-frais.router";

/** Wiring DI du module notes-de-frais : assemble le routeur tRPC à partir du repository injecté. */
export interface NotesDeFraisModuleDeps {
  readonly repository: INoteDeFraisRepository;
  readonly db?: DbClient;
}

export interface NotesDeFraisModule {
  readonly deps: NotesDeFraisModuleDeps;
  readonly router: ReturnType<typeof createNotesDeFraisRouter>;
}

export function createNotesDeFraisModule(deps: NotesDeFraisModuleDeps): NotesDeFraisModule {
  return { deps, router: createNotesDeFraisRouter(deps.repository, deps.db) };
}
