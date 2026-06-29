import type { IFactureRepository } from "./application/facture-repository";
import type { IDevisReader } from "./application/devis-reader";
import type { ComptaPort } from "./application/compta-port";
import { NOOP_COMPTA } from "./application/compta-port";
import type { FactureMailingDeps } from "./application/envoyer-facture-email";
import type { PushPort } from "../../shared/push/web-push-adapter";
import type { DbClient } from "../../shared/db";
import type { IStockRepository } from "../stocks/application/stock-repository";
import type { StoragePort } from "../../shared/ports/storage";
import { createFacturesRouter } from "./interface/trpc/factures.router";
import { AttestationTvaRepositoryDrizzle } from "./infra/attestation-tva-repository-drizzle";
import type { TenantContext } from "../../shared/tenant";

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
  /** Pool DB pour les transactions outbox events (défaut : sans outbox). */
  readonly db?: DbClient;
  /** Repository stocks (décrément auto à l'émission). Optionnel : sans stock si absent. */
  readonly stockRepo?: IStockRepository;
  /** Stockage objet (S3) pour les PDFs d'attestation TVA. Optionnel : sans stockage si absent. */
  readonly storage?: StoragePort;
  /** Lecteur de date de verrouillage comptable (garde anti-création/modif en période close). */
  readonly lockDateReader?: { getLockDate(ctx: TenantContext): Promise<string | null> };
}

export interface FacturesModule {
  readonly deps: FacturesModuleDeps;
  readonly router: ReturnType<typeof createFacturesRouter>;
}

export function createFacturesModule(deps: FacturesModuleDeps): FacturesModule {
  const attestationRepo = deps.db ? new AttestationTvaRepositoryDrizzle(deps.db) : undefined;
  return { deps, router: createFacturesRouter(deps.repository, deps.devisReader, deps.compta ?? NOOP_COMPTA, deps.mailing, deps.push, deps.outboxInTx, deps.db, deps.stockRepo, deps.storage, attestationRepo, deps.lockDateReader) };
}
