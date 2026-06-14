import { describe, it, expect } from "vitest";
import { createConfigRelancesModule } from "./config-relances.module";
import { defaultConfigRelances } from "./domain/config-relances";
import type { IConfigRelancesRepository } from "./application/config-relances-repository";

const stubRepo: IConfigRelancesRepository = {
  get: async (ctx) => defaultConfigRelances(ctx.artisanId),
  upsert: async (ctx) => defaultConfigRelances(ctx.artisanId),
};

describe("config-relances.module", () => {
  it("createConfigRelancesModule câble le repository injecté", () => {
    const module = createConfigRelancesModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose un singleton get/upsert (pas de CRUD by-id)", () => {
    expect(Object.keys(stubRepo).sort()).toEqual(["get", "upsert"]);
  });

  it("defaultConfigRelances aligne les défauts de la table", () => {
    const d = defaultConfigRelances(42);
    expect(d.artisanId).toBe(42);
    expect(d.actif).toBe(false);
    expect(d.joursApresEnvoi).toBe(7);
    expect(d.joursEntreRelances).toBe(7);
    expect(d.nombreMaxRelances).toBe(3);
    expect(d.heureEnvoi).toBe("09:00");
    expect(d.joursEnvoi).toBe("1,2,3,4,5");
    expect(d.modeleEmailId).toBeNull();
  });
});
