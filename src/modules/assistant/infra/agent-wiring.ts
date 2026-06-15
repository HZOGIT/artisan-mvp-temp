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
import { buildAssistantWriteHandlers, type AssistantWriteDeps } from "../application/write-tool-handlers";
import { AssistantReadToolRegistry, type ToolHandler } from "../application/assistant-tool-registry";
import type { IClientRepository } from "../../clients/application/client-repository";
import { creerClient } from "../../clients/application/write-use-cases";
import type { IInterventionRepository } from "../../interventions/application/intervention-repository";
import type { InterventionStatut } from "../../interventions/domain/intervention";
import { creerIntervention, modifierIntervention } from "../../interventions/application/write-use-cases";
import type { IDevisRepository } from "../../devis/application/devis-repository";
import { creerDevis, ajouterLigneDevis } from "../../devis/application/write-use-cases";

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

// Repos d'ÉCRITURE (Phase 3b-i : clients/interventions/devis — sans envoi email). Étendu en 3b-ii
// (factures + envois + commandes, qui exigent aussi les mailing deps).
export interface AssistantAgentWriteRepos {
  readonly clientRepo: IClientRepository;
  readonly interventionRepo: IInterventionRepository;
  readonly devisRepo: IDevisRepository;
}

// Adapte les use-cases d'écriture migrés aux ports `*ForAgent` (wrappers triviaux ; ownership/validation
// dans les use-cases). Phase 3b-i : creer_client, creer_intervention, modifier_intervention, creer_devis.
export function buildAssistantWriteDeps(repos: AssistantAgentWriteRepos): AssistantWriteDeps {
  const { clientRepo, interventionRepo, devisRepo } = repos;
  return {
    clients: { create: (ctx, input) => creerClient(clientRepo, ctx, input) },
    clientsById: clientRepo,
    interventions: { create: (ctx, input) => creerIntervention(interventionRepo, ctx, input) },
    interventionUpdater: {
      modifier: (ctx, id, patch) => modifierIntervention(interventionRepo, ctx, id, { ...patch, statut: patch.statut as InterventionStatut | undefined }),
    },
    devis: {
      creer: (ctx, input) => creerDevis(devisRepo, ctx, input),
      ajouterLigne: async (ctx, devisId, ligne) => {
        await ajouterLigneDevis(devisRepo, ctx, devisId, ligne);
      },
      getById: (ctx, id) => devisRepo.getById(ctx, id),
    },
  };
}

// Handlers d'écriture câblés depuis les repos migrés (Phase 3b-i).
export function buildAssistantWriteHandlersFromRepos(repos: AssistantAgentWriteRepos): Record<string, ToolHandler> {
  return buildAssistantWriteHandlers(buildAssistantWriteDeps(repos));
}

// Construit le registry agentique : lectures câblées (toujours) + écritures (opt-in — Phase 3b fournit
// `writeHandlers` ; vides → registry de lecture seule, défaut sûr).
export function buildAssistantAgentRegistry(repos: AssistantAgentReadRepos, writeHandlers: Record<string, ToolHandler> = {}): AssistantReadToolRegistry {
  return new AssistantReadToolRegistry(buildAssistantReadHandlers(buildAssistantReadDeps(repos)), writeHandlers);
}
