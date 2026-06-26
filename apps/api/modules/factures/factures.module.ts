import type { IFactureRepository } from "./application/facture-repository";
import type { IDevisReader } from "./application/devis-reader";
import type { ComptaPort } from "./application/compta-port";
import { NOOP_COMPTA } from "./application/compta-port";
import type { FactureMailingDeps } from "./application/envoyer-facture-email";
import type { PushPort } from "../../shared/push/web-push-adapter";
import type { DbClient } from "../../shared/db";
import type { EventBusPort } from "../../shared/ports/event-bus";
import { createFacturesRouter } from "./interface/trpc/factures.router";

/*
 * Wiring DI du module factures : assemble le routeur tRPC à partir du repository, du lecteur de
 * devis (conversion cross-domaine), du port compta (effet de bord FEC) et des dépendances d'envoi
 * par email (artisan/client readers + PDF + email + rate-limit), tous injectés.
 */
export interface FacturesModuleDeps {
  readonly repository: IFactureRepository;
  readonly devisReader: IDevisReader;
  /** Port compta (FEC). Optionnel : no-op tant que le domaine compta n'est pas porté. */
  readonly compta?: ComptaPort;
  /** Composition de l'envoi par email (lecture artisan/client + PdfPort + EmailPort + rate-limiter). */
  readonly mailing: FactureMailingDeps;
  readonly push?: PushPort;
  /** Outbox PA : insert dans pa_outbox dans la même tx que setStatut (atomicité réglementaire). */
  readonly outboxInTx?: (artisanId: number, factureId: number, tx: DbClient) => Promise<void>;
  readonly eventBus?: EventBusPort;
}

export interface FacturesModule {
  readonly deps: FacturesModuleDeps;
  readonly router: ReturnType<typeof createFacturesRouter>;
}

export function createFacturesModule(deps: FacturesModuleDeps): FacturesModule {
  return { deps, router: createFacturesRouter(deps.repository, deps.devisReader, deps.compta ?? NOOP_COMPTA, deps.mailing, deps.push, deps.outboxInTx, deps.eventBus) };
}
