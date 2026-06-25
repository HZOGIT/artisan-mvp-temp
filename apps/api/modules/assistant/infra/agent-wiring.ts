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
import type { IFactureRepository } from "../../factures/application/facture-repository";
import type { IDevisReader } from "../../factures/application/devis-reader";
import { creerFacture, ajouterLigneFacture, modifierFacture, convertirDevisEnFacture } from "../../factures/application/write-use-cases";
import type { ICommandeRepository } from "../../commandes/application/commande-repository";
import { creerCommande } from "../../commandes/application/write-use-cases";
import { envoyerDevisParEmail, type DevisMailingDeps } from "../../devis/application/envoyer-devis-email";
import { envoyerFactureParEmail, type FactureMailingDeps } from "../../factures/application/envoyer-facture-email";
import { envoyerRelanceFacture, type RelanceMailingDeps } from "../../factures/application/envoyer-relance-facture";
import { envoyerCommandeParEmail, type CommandeMailingDeps } from "../../commandes/application/envoyer-commande-email";

/*
 * Câblage de l'assistant agentique : adapte les repos/use-cases DÉJÀ MIGRÉS aux ports `*ForAgent` et
 * construit le registry. Les repos migrés satisfont STRUCTURELLEMENT les interfaces de lecture (méthode
 * `list(ctx)` renvoyant le type domaine, sur-ensemble du sous-type agent) → passage direct. Seul
 * `get_statistiques` compose le dashboard reader migré via `getStats`.
 */
export interface AssistantAgentReadRepos {
  readonly clients: ClientsReaderForAgent;
  readonly factures: FacturesReaderForAgent;
  readonly devis: DevisReaderForAgent;
  readonly stocks: StocksReaderForAgent;
  readonly fournisseurs: FournisseursReaderForAgent;
  readonly interventions: InterventionsReaderForAgent;
  readonly dashboardReader: IDashboardReader;
}

/** Construit les deps de LECTURE (12 outils) depuis les repos migrés. */
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

/*
 * Repos d'ÉCRITURE. `clientRepo`/`interventionRepo`/`devisRepo` requis (3b-i) ; `factureRepo`+`devisReader`
 * (conversion devis→facture) et `commandeRepo` optionnels (3b-ii créations). Les ENVOIS (3b-iii) exigent
 * en plus les mailing deps (cf. `AssistantAgentSenders`).
 */
export interface AssistantAgentWriteRepos {
  readonly clientRepo: IClientRepository;
  readonly interventionRepo: IInterventionRepository;
  readonly devisRepo: IDevisRepository;
  readonly factureRepo?: IFactureRepository;
  readonly devisReader?: IDevisReader;
  readonly commandeRepo?: ICommandeRepository;
}

/*
 * Mailing deps (construits dans buildApp pour les routes d'envoi) requis pour câbler les ENVOIS. Un
 * sender n'est câblé que si son mailing (et son repo) est fourni. La relance n'attache PAS de PDF.
 */
export interface AssistantAgentMailing {
  readonly devis?: DevisMailingDeps;
  readonly facture?: FactureMailingDeps;
  readonly relance?: RelanceMailingDeps;
  /** embarque repo + fournisseurRepo */
  readonly commande?: CommandeMailingDeps;
}

/*
 * Adapte les use-cases d'écriture migrés aux ports `*ForAgent` (wrappers triviaux ; ownership/validation
 * dans les use-cases). Un outil n'est câblé que si ses repos/mailing sont fournis.
 */
export function buildAssistantWriteDeps(repos: AssistantAgentWriteRepos, mailing: AssistantAgentMailing = {}): AssistantWriteDeps {
  const { clientRepo, interventionRepo, devisRepo, factureRepo, devisReader, commandeRepo } = repos;
  const { devis: devisMail, facture: factureMail, relance: relanceMail, commande: commandeMail } = mailing;
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
    ...(factureRepo && devisReader
      ? {
          factures: {
            creer: (ctx, input) => creerFacture(factureRepo, ctx, input),
            ajouterLigne: async (ctx, factureId, ligne) => {
              await ajouterLigneFacture(factureRepo, ctx, factureId, ligne);
            },
            convertirDevis: (ctx, devisId) => convertirDevisEnFacture(factureRepo, devisReader, ctx, devisId),
            setObjet: async (ctx, factureId, objet) => {
              await modifierFacture(factureRepo, ctx, factureId, { objet });
            },
            getById: (ctx, id) => factureRepo.getById(ctx, id),
          },
        }
      : {}),
    ...(commandeRepo
      ? {
          commandes: {
            /*
             * `numero` est généré par le repo à la création (CMD-xxxxx) ; le type `string | null` est
             * permissif → on coerce (jamais nul en pratique).
             */
            creer: async (ctx, input) => {
              const c = await creerCommande(commandeRepo, ctx, input);
              return { id: c.id, numero: c.numero ?? "", totalTTC: c.totalTTC ?? "0" };
            },
          },
        }
      : {}),
    /** ── Envois (PDF via PdfPort, email via EmailPort, statut, rate-limit ; portés par les use-cases). ── */
    ...(devisMail
      ? { devisSender: { envoyer: (ctx, id, m) => envoyerDevisParEmail(devisRepo, devisMail, ctx, { devisId: id, customMessage: m, attachPdf: true }) } }
      : {}),
    ...(factureRepo && factureMail
      ? { factureSender: { envoyer: (ctx, id, m) => envoyerFactureParEmail(factureRepo, factureMail, ctx, { factureId: id, customMessage: m, attachPdf: true }) } }
      : {}),
    ...(factureRepo && relanceMail
      ? { relanceSender: { envoyer: (ctx, id, m) => envoyerRelanceFacture(factureRepo, relanceMail, ctx, { factureId: id, customMessage: m }) } }
      : {}),
    /** `envoyerCommandeParEmail` n'accepte pas de message personnalisé (le use-case migré l'a dropé) → ignoré. */
    ...(commandeMail ? { commandeSender: { envoyer: (ctx, id) => envoyerCommandeParEmail(commandeMail, ctx, id) } } : {}),
  };
}

/** Handlers d'écriture câblés depuis les repos migrés (+ mailing pour les envois). */
export function buildAssistantWriteHandlersFromRepos(repos: AssistantAgentWriteRepos, mailing: AssistantAgentMailing = {}): Record<string, ToolHandler> {
  return buildAssistantWriteHandlers(buildAssistantWriteDeps(repos, mailing));
}

/*
 * Construit le registry agentique : lectures câblées (toujours) + écritures (opt-in — Phase 3b fournit
 * `writeHandlers` ; vides → registry de lecture seule, défaut sûr).
 */
export function buildAssistantAgentRegistry(repos: AssistantAgentReadRepos, writeHandlers: Record<string, ToolHandler> = {}): AssistantReadToolRegistry {
  return new AssistantReadToolRegistry(buildAssistantReadHandlers(buildAssistantReadDeps(repos)), writeHandlers);
}
