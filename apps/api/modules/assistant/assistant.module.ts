import type { IAssistantThreadsRepository } from "./application/assistant-threads-repository";
import type { AssistantGeneratorDeps } from "./application/generator-use-cases";
import { createAssistantRouter } from "./interface/trpc/assistant.router";

/** Wiring DI du module assistant : lectures threads/messages (threadsRepo) + 4 générateurs IA (deps). */
export interface AssistantModuleDeps {
  readonly threadsRepo: IAssistantThreadsRepository;
  readonly generators: AssistantGeneratorDeps;
}

export interface AssistantModule {
  readonly deps: AssistantModuleDeps;
  readonly router: ReturnType<typeof createAssistantRouter>;
}

export function createAssistantModule(deps: AssistantModuleDeps): AssistantModule {
  return { deps, router: createAssistantRouter(deps.threadsRepo, deps.generators) };
}
