import type { IImportErpRepository } from "./application/import-erp-repository";
import { createImportErpRouter } from "./interface/trpc/import-erp.router";

/** Wiring DI du module « importErp » (import de reprise de données ERP : clients/devis/factures légers). */
export interface ImportErpModuleDeps {
  readonly repo: IImportErpRepository;
}

export interface ImportErpModule {
  readonly deps: ImportErpModuleDeps;
  readonly router: ReturnType<typeof createImportErpRouter>;
}

export function createImportErpModule(deps: ImportErpModuleDeps): ImportErpModule {
  return { deps, router: createImportErpRouter(deps.repo) };
}
