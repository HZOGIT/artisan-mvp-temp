import type { IClientRepository } from "./application/client-repository";
import type { IEmailOptoutRepository } from "../emails/application/email-optout-repository";
import type { EmailPort } from "../../shared/ports/email";
import type { DbClient } from "../../shared/db";
import { createClientsRouter } from "./interface/trpc/clients.router";

/*
 * Wiring DI du module clients : assemble le routeur tRPC à partir du repository injecté.
 * Les deps email sont optionnelles (absentes en test unitaire) ; sans elles, `envoyerMessage`
 * retourne une ValidationError "service non disponible".
 */
export interface ClientsModuleDeps {
  readonly repository: IClientRepository;
  readonly email?: EmailPort;
  readonly optoutRepo?: IEmailOptoutRepository;
  readonly db?: DbClient;
  readonly appUrl?: string;
  readonly unsubscribeSecret?: string;
}

export interface ClientsModule {
  readonly deps: ClientsModuleDeps;
  readonly router: ReturnType<typeof createClientsRouter>;
}

export function createClientsModule(deps: ClientsModuleDeps): ClientsModule {
  return { deps, router: createClientsRouter(deps) };
}
