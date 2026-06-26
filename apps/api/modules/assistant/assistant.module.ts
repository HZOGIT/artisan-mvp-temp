import type { IAssistantThreadsRepository } from "./application/assistant-threads-repository";
import type { AssistantGeneratorDeps } from "./application/generator-use-cases";
import type { AssistantAgentDeps } from "./application/assistant-agent-use-cases";
import type { StoragePort } from "../../shared/ports/storage";
import type { DbClient } from "../../shared/db";
import { createAssistantRouter } from "./interface/trpc/assistant.router";

export interface AssistantModuleDeps {
  readonly threadsRepo: IAssistantThreadsRepository;
  readonly generators: AssistantGeneratorDeps;
  readonly agentDeps: AssistantAgentDeps;
  readonly storage: StoragePort;
  readonly db: DbClient;
}

export interface AssistantModule {
  readonly deps: AssistantModuleDeps;
  readonly router: ReturnType<typeof createAssistantRouter>;
}

export function createAssistantModule(deps: AssistantModuleDeps): AssistantModule {
  return { deps, router: createAssistantRouter(deps.threadsRepo, deps.generators, deps.agentDeps, deps.storage, deps.db) };
}
