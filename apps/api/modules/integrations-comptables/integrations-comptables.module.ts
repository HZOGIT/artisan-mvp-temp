import type { TenantContext } from "../../shared/tenant";
import type { IIntegrationsComptablesRepository } from "./application/integrations-comptables-repository";
import { createIntegrationsComptablesRouter } from "./interface/trpc/integrations-comptables.router";

/*
 * Wiring DI du module « integrationsComptables » (exports/sync comptables). `fec` = fournisseur du
 * contenu FEC opposable (branché sur le générateur du domaine comptabilité migré).
 */
export interface IntegrationsComptablesModuleDeps {
  readonly repo: IIntegrationsComptablesRepository;
  readonly fec: { getFecContent(ctx: TenantContext, period: { dateDebut: Date; dateFin: Date }): Promise<string> };
}

export interface IntegrationsComptablesModule {
  readonly deps: IntegrationsComptablesModuleDeps;
  readonly router: ReturnType<typeof createIntegrationsComptablesRouter>;
}

export function createIntegrationsComptablesModule(deps: IntegrationsComptablesModuleDeps): IntegrationsComptablesModule {
  return { deps, router: createIntegrationsComptablesRouter(deps.repo, deps.fec) };
}
