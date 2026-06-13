import { describe, it, expect } from "vitest";
import { createAvisModule } from "./avis.module";
import type { IAvisRepository } from "./application/avis-repository";
import { FakeDemandeAvisRepository } from "./infra/demande-avis-repository-fake";
import { FakeEmailPort, FakeRateLimiter } from "../../shared/ports/fakes";
import type { DemandeAvisDeps } from "./application/demande-avis-use-cases";

const stubRepo: IAvisRepository = {
  list: async () => [],
  listEnrichi: async () => [],
  getById: async () => null,
  getStats: async () => ({ moyenne: 0, total: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } }),
  repondre: async () => null,
  changerStatut: async () => null,
};

const demande: DemandeAvisDeps = {
  repo: new FakeDemandeAvisRepository(),
  email: new FakeEmailPort(),
  rateLimiter: new FakeRateLimiter(),
  lienBaseUrl: "https://test.operioz.com",
};

describe("avis.module", () => {
  it("createAvisModule câble les dépendances injectées", () => {
    const module = createAvisModule({ avisRepo: stubRepo, demande });
    expect(module.deps.avisRepo).toBe(stubRepo);
    expect(module.deps.demande).toBe(demande);
  });

  it("le port de lecture/écriture expose les opérations attendues", () => {
    expect(Object.keys(stubRepo).sort()).toEqual(["changerStatut", "getById", "getStats", "list", "listEnrichi", "repondre"]);
  });

  it("expose un routeur tRPC assemblé (procédures parité + workflow)", () => {
    const module = createAvisModule({ avisRepo: stubRepo, demande });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual([
      "envoyerDemande",
      "envoyerDemandeParClient",
      "getAll",
      "getById",
      "getStats",
      "list",
      "moderer",
      "repondre",
    ]);
  });
});
