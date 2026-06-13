import type { INoteDeFraisRepository } from "./application/note-de-frais-repository";

// Wiring DI du module notes-de-frais. À l'étape scaffold, le module ne porte que ses
// dépendances ; le routeur tRPC sera assemblé et exposé à l'étape interface (5/9).
export interface NotesDeFraisModuleDeps {
  readonly repository: INoteDeFraisRepository;
}

export interface NotesDeFraisModule {
  readonly deps: NotesDeFraisModuleDeps;
}

export function createNotesDeFraisModule(deps: NotesDeFraisModuleDeps): NotesDeFraisModule {
  return { deps };
}
