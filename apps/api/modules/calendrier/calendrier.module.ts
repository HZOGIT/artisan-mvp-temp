import type { IIcalFeedRepository, TokenGenerator } from "./application/ical-feed-repository";
import { randomHexToken } from "./infra/token-generator";
import { createCalendrierRouter } from "./interface/trpc/calendrier.router";

/*
 * Wiring DI du module « calendrier » (jeton de flux iCal). `genererToken` injectable (défaut : jeton
 * hex aléatoire) pour des tests déterministes.
 */
export interface CalendrierModuleDeps {
  readonly repository: IIcalFeedRepository;
  readonly genererToken?: TokenGenerator;
}

export interface CalendrierModule {
  readonly deps: CalendrierModuleDeps;
  readonly router: ReturnType<typeof createCalendrierRouter>;
}

export function createCalendrierModule(deps: CalendrierModuleDeps): CalendrierModule {
  return { deps, router: createCalendrierRouter(deps.repository, deps.genererToken ?? randomHexToken) };
}
