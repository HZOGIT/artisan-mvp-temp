import { describe, expect, it } from "vitest";
import { isV2Path, resolveV2Path, V2_ROUTES } from "./v2-routes";

describe("resolveV2Path", () => {
  it("renvoie le chemin /v2 pour une route migrée", () => {
    expect(resolveV2Path("/clients")).toBe("/v2/clients");
  });

  it("ignore le slash final et la query/hash", () => {
    expect(resolveV2Path("/clients/")).toBe("/v2/clients");
    expect(resolveV2Path("/clients?source=menu")).toBe("/v2/clients");
    expect(resolveV2Path("/clients#top")).toBe("/v2/clients");
  });

  it("renvoie null pour une route non migrée", () => {
    expect(resolveV2Path("/profil")).toBeNull();
    expect(resolveV2Path("/")).toBeNull();
  });

  it("ne re-bascule pas un chemin déjà sous /v2 (absent du registre)", () => {
    expect(resolveV2Path("/v2/clients")).toBeNull();
  });
});

describe("isV2Path", () => {
  it("vrai pour /v2 et ses sous-chemins", () => {
    expect(isV2Path("/v2")).toBe(true);
    expect(isV2Path("/v2/")).toBe(true);
    expect(isV2Path("/v2/clients")).toBe(true);
    expect(isV2Path("/v2/clients?x=1")).toBe(true);
  });

  it("faux pour les routes legacy", () => {
    expect(isV2Path("/clients")).toBe(false);
    expect(isV2Path("/")).toBe(false);
    expect(isV2Path("/v2bis")).toBe(false); // ne doit PAS matcher un préfixe trompeur
  });
});

describe("V2_ROUTES", () => {
  it("ne mappe que des cibles sous /v2", () => {
    for (const target of Object.values(V2_ROUTES)) {
      expect(target.startsWith("/v2/")).toBe(true);
    }
  });
});
