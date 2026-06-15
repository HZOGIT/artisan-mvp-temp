import { describe, it, expect } from "vitest";
import type { TenantContext } from "../../../shared/tenant";
import { FakeDashboardReader } from "../../dashboard/infra/dashboard-reader-fake";
import { buildAssistantAgentRegistry, type AssistantAgentReadRepos } from "./agent-wiring";
// Vérif de PARITÉ STRUCTURELLE (compile-time) : les interfaces des repos migrés satisfont les ports
// `*ForAgent`. Si un repo dérive (renomme `list`, change un type), la compilation casse ici.
import type { IClientRepository } from "../../clients/application/client-repository";
import type { IFactureRepository } from "../../factures/application/facture-repository";
import type { IDevisRepository } from "../../devis/application/devis-repository";
import type { IStockRepository } from "../../stocks/application/stock-repository";
import type { IFournisseurRepository } from "../../fournisseurs/application/fournisseur-repository";
import type { IInterventionRepository } from "../../interventions/application/intervention-repository";
import type {
  ClientsReaderForAgent,
  FacturesReaderForAgent,
  DevisReaderForAgent,
  StocksReaderForAgent,
  FournisseursReaderForAgent,
  InterventionsReaderForAgent,
} from "../application/read-tool-handlers";

// Assignabilité (compile-time) : un repo migré EST un reader agent.
type Assert<T extends true> = T;
type Extends<A, B> = A extends B ? true : false;
type _C = Assert<Extends<IClientRepository, ClientsReaderForAgent>>;
type _F = Assert<Extends<IFactureRepository, FacturesReaderForAgent>>;
type _D = Assert<Extends<IDevisRepository, DevisReaderForAgent>>;
type _S = Assert<Extends<IStockRepository, StocksReaderForAgent>>;
type _Fo = Assert<Extends<IFournisseurRepository, FournisseursReaderForAgent>>;
type _I = Assert<Extends<IInterventionRepository, InterventionsReaderForAgent>>;

const ctx: TenantContext = { artisanId: 1, userId: 1 };

// Fakes minimaux satisfaisant uniquement la surface lecture utilisée (`list`).
function repos(): AssistantAgentReadRepos {
  const empty = { list: async () => [] };
  return {
    clients: empty,
    factures: empty,
    devis: empty,
    stocks: empty,
    fournisseurs: empty,
    interventions: empty,
    dashboardReader: new FakeDashboardReader(),
  };
}

describe("agent-wiring — registry de lecture câblé", () => {
  it("expose les 12 lectures + naviguer_vers", () => {
    const reg = buildAssistantAgentRegistry(repos());
    expect(reg.tools.map((t) => t.name).sort()).toEqual(
      [
        "chercher_client",
        "lister_clients",
        "lister_factures",
        "lister_factures_impayees",
        "lister_devis",
        "lister_devis_en_attente",
        "verifier_stocks",
        "lister_fournisseurs",
        "chercher_fournisseur",
        "lister_interventions",
        "get_statistiques",
        "naviguer_vers",
      ].sort(),
    );
  });

  it("get_statistiques (composé via le dashboard reader migré) → ok", async () => {
    const reg = buildAssistantAgentRegistry(repos());
    const res = await reg.execute("get_statistiques", {}, ctx);
    expect(res.ok).toBe(true);
  });

  it("sans writeHandlers → les écritures restent refusées (défaut sûr)", async () => {
    const reg = buildAssistantAgentRegistry(repos());
    expect(reg.tools.some((t) => t.name === "creer_client")).toBe(false);
    expect((await reg.execute("creer_client", { nom: "X" }, ctx)).ok).toBe(false);
  });
});
