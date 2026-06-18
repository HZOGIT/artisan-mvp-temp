import { describe, it, expect } from "vitest";
import { VitrinePublicReaderFake } from "./infra/vitrine-public-reader-fake";
import { createVitrineModule } from "./vitrine.module";

describe("createVitrineModule", () => {
  it("assemble un router avec les procs publiques + admin", () => {
    const mod = createVitrineModule({
      reader: new VitrinePublicReaderFake(),
      rateLimiter: { check: async () => true },
      email: { send: async () => {} },
      notifications: { creer: async () => ({}) },
      leads: { list: async () => [], getById: async () => null, setStatut: async () => ({}), create: async () => ({}) },
      clients: { create: async () => ({ id: 1 }) },
    });
    const r = mod.router as Record<string, unknown>;
    for (const k of ["getBySlug", "submitContact", "getDemandesContact", "updateDemandeContactStatut", "convertirDemandeEnClient"]) {
      expect(typeof r[k]).not.toBe("undefined");
    }
  });
});
