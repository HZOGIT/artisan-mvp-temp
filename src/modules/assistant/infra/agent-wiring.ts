import type { TenantContext } from "../../../shared/tenant";
import { getStats } from "../../dashboard/application/use-cases";
import type { IDashboardReader } from "../../dashboard/application/dashboard-reader";
import {
  buildAssistantReadHandlers,
  type AssistantReadDeps,
  type ClientsReaderForAgent,
  type FacturesReaderForAgent,
  type DevisReaderForAgent,
  type StocksReaderForAgent,
  type FournisseursReaderForAgent,
  type InterventionsReaderForAgent,
} from "../application/read-tool-handlers";
import { AssistantReadToolRegistry, type ToolHandler } from "../application/assistant-tool-registry";

// Câblage de l'assistant agentique : adapte les repos/use-cases DÉJÀ MIGRÉS aux ports `*ForAgent` et
// construit le registry. Les repos migrés satisfont STRUCTURELLEMENT les interfaces de lecture (méthode
// `list(ctx)` renvoyant le type domaine, sur-ensemble du sous-type agent) → passage direct. Seul
// `get_statistiques` compose le dashboard reader migré via `getStats`.
export interface AssistantAgentReadRepos {
  readonly clients: ClientsReaderForAgent;
  readonly factures: FacturesReaderForAgent;
  readonly devis: DevisReaderForAgent;
  readonly stocks: StocksReaderForAgent;
  readonly fournisseurs: FournisseursReaderForAgent;
  readonly interventions: InterventionsReaderForAgent;
  readonly dashboardReader: IDashboardReader;
}

// Construit les deps de LECTURE (12 outils) depuis les repos migrés.
export function buildAssistantReadDeps(repos: AssistantAgentReadRepos): AssistantReadDeps {
  return {
    clients: repos.clients,
    factures: repos.factures,
    devis: repos.devis,
    stocks: repos.stocks,
    fournisseurs: repos.fournisseurs,
    interventions: repos.interventions,
    stats: { getStats: (ctx: TenantContext) => getStats(repos.dashboardReader, ctx) },
  };
}

// Construit le registry agentique : lectures câblées (toujours) + écritures (opt-in — Phase 3b fournit
// `writeHandlers` ; vides → registry de lecture seule, défaut sûr).
export function buildAssistantAgentRegistry(repos: AssistantAgentReadRepos, writeHandlers: Record<string, ToolHandler> = {}): AssistantReadToolRegistry {
  return new AssistantReadToolRegistry(buildAssistantReadHandlers(buildAssistantReadDeps(repos)), writeHandlers);
}
