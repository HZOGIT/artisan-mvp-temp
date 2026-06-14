import { describe, it, expect } from "vitest";
import { createParametresModule } from "./parametres.module";
import { defaultParametres } from "./domain/parametres";
import type { IParametresRepository } from "./application/parametres-repository";

const stubRepo: IParametresRepository = {
  get: async (ctx) => defaultParametres(ctx.artisanId),
  upsert: async (ctx) => defaultParametres(ctx.artisanId),
};

describe("parametres.module", () => {
  it("createParametresModule câble le repository injecté", () => {
    const module = createParametresModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose un singleton get/upsert (pas de CRUD by-id)", () => {
    expect(Object.keys(stubRepo).sort()).toEqual(["get", "upsert"]);
  });

  it("defaultParametres aligne les défauts de la table et n'expose pas de compteur modifiable", () => {
    const d = defaultParametres(42);
    expect(d.artisanId).toBe(42);
    expect(d.prefixeDevis).toBe("DEV");
    expect(d.prefixeFacture).toBe("FAC");
    expect(d.prefixeAvoir).toBe("AV");
    expect(d.delaiPaiementType).toBe("net");
    // compteurs en lecture seule (pilotés par la numérotation) — présents mais initialisés à 1
    expect(d.compteurDevis).toBe(1);
    expect(d.compteurFacture).toBe(1);
    expect(d.compteurAvoir).toBe(1);
  });
});
