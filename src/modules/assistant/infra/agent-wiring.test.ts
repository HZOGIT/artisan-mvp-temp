import { describe, it, expect } from "vitest";
import type { TenantContext } from "../../../shared/tenant";
import { FakeDashboardReader } from "../../dashboard/infra/dashboard-reader-fake";
import { buildAssistantAgentRegistry, buildAssistantWriteHandlersFromRepos, type AssistantAgentReadRepos } from "./agent-wiring";
import { FakeClientRepository } from "../../clients/infra/client-repository-fake";
import { FakeInterventionRepository } from "../../interventions/infra/intervention-repository-fake";
import { FakeDevisRepository } from "../../devis/infra/devis-repository-fake";
import { FakeFactureRepository } from "../../factures/infra/facture-repository-fake";
import { FakeDevisReader } from "../../factures/infra/devis-reader-fake";
import { FakeCommandeRepository } from "../../commandes/infra/commande-repository-fake";
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

describe("agent-wiring — écritures câblées (Phase 3b-i)", () => {
  function writeRepos() {
    return { clientRepo: new FakeClientRepository(), interventionRepo: new FakeInterventionRepository(), devisRepo: new FakeDevisRepository() };
  }

  it("expose les 4 écritures clients/interventions/devis", () => {
    const reg = buildAssistantAgentRegistry(repos(), buildAssistantWriteHandlersFromRepos(writeRepos()));
    for (const name of ["creer_client", "creer_intervention", "modifier_intervention", "creer_devis"]) {
      expect(reg.tools.some((t) => t.name === name)).toBe(true);
    }
  });

  it("creer_client exécuté de bout en bout (use-case migré + repo) → ok + clientId", async () => {
    const wr = writeRepos();
    const reg = buildAssistantAgentRegistry(repos(), buildAssistantWriteHandlersFromRepos(wr));
    const res = await reg.execute("creer_client", { nom: "Dupont", prenom: "Jean" }, ctx);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const data = res.data as { clientId: number; nom: string };
      expect(data.nom).toBe("Dupont");
      expect(await wr.clientRepo.getById(ctx, data.clientId)).not.toBeNull();
    }
  });

  it("creer_client cross-tenant pour l'intervention : intervention sur client absent → ok:false (anti-IDOR)", async () => {
    const reg = buildAssistantAgentRegistry(repos(), buildAssistantWriteHandlersFromRepos(writeRepos()));
    // clientId 999 n'existe pas → le use-case migré refuse (ownership FK).
    const res = await reg.execute("creer_intervention", { clientId: 999, titre: "X", dateDebut: "2026-07-01T08:00:00", dateFin: "2026-07-01T10:00:00" }, ctx);
    expect(res.ok).toBe(false);
  });

  it("factures + commandes câblées quand les repos sont fournis (6 écritures)", async () => {
    const wr = {
      clientRepo: new FakeClientRepository(),
      interventionRepo: new FakeInterventionRepository(),
      devisRepo: new FakeDevisRepository(),
      factureRepo: new FakeFactureRepository(),
      devisReader: new FakeDevisReader(),
      commandeRepo: new FakeCommandeRepository(),
    };
    const reg = buildAssistantAgentRegistry(repos(), buildAssistantWriteHandlersFromRepos(wr));
    for (const name of ["creer_client", "creer_intervention", "modifier_intervention", "creer_devis", "creer_facture", "creer_commande_fournisseur"]) {
      expect(reg.tools.some((t) => t.name === name), name).toBe(true);
    }
    // envois pas encore câblés (3b-iii) : absents
    expect(reg.tools.some((t) => t.name === "envoyer_devis")).toBe(false);
  });

  it("creer_commande_fournisseur exécuté de bout en bout (use-case migré) → ok ou refus métier (pas d'exception)", async () => {
    const commandeRepo = new FakeCommandeRepository();
    const wr = { clientRepo: new FakeClientRepository(), interventionRepo: new FakeInterventionRepository(), devisRepo: new FakeDevisRepository(), commandeRepo };
    const reg = buildAssistantAgentRegistry(repos(), buildAssistantWriteHandlersFromRepos(wr));
    // fournisseur 999 absent → le use-case migré refuse (ownership) → {ok:false}, jamais une exception non captée.
    const res = await reg.execute("creer_commande_fournisseur", { fournisseurId: 999, lignes: [{ designation: "Tube", quantite: 2, prixUnitaireHT: 10 }] }, ctx);
    expect(res.ok).toBe(false);
  });
});
