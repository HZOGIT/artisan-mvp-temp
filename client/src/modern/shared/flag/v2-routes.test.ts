import { describe, expect, it } from "vitest";
import { isV2Path, resolveV2Path, V2_ROUTES } from "./v2-routes";

describe("resolveV2Path", () => {
  it("renvoie le chemin /v2 pour une route migrée", () => {
    expect(resolveV2Path("/clients")).toBe("/v2/clients");
    expect(resolveV2Path("/")).toBe("/v2/home"); // vitrine migrée
  });

  it("ignore le slash final et la query/hash", () => {
    expect(resolveV2Path("/clients/")).toBe("/v2/clients");
    expect(resolveV2Path("/clients?source=menu")).toBe("/v2/clients");
    expect(resolveV2Path("/clients#top")).toBe("/v2/clients");
  });

  it("renvoie null pour une route non migrée", () => {
    expect(resolveV2Path("/onboarding")).toBeNull();
  });

  it("ne re-bascule pas un chemin déjà sous /v2 (absent du registre)", () => {
    expect(resolveV2Path("/v2/clients")).toBeNull();
  });

  it("résout les routes À PARAMÈTRE (substitution du param)", () => {
    expect(resolveV2Path("/clients/123")).toBe("/v2/clients/123");
    expect(resolveV2Path("/devis/45")).toBe("/v2/devis/45");
    expect(resolveV2Path("/factures/7")).toBe("/v2/factures/7");
    expect(resolveV2Path("/contrats/9")).toBe("/v2/contrats/9");
    expect(resolveV2Path("/commandes/12")).toBe("/v2/commandes/12");
    expect(resolveV2Path("/commandes/12/modifier")).toBe("/v2/commandes/12/modifier");
    expect(resolveV2Path("/devis/45/ligne/nouvelle")).toBe("/v2/devis/45/ligne/nouvelle");
  });

  it("priorité au chemin EXACT statique sur la route à paramètre", () => {
    expect(resolveV2Path("/devis/nouveau")).toBe("/v2/devis/nouveau"); // pas /v2/devis/nouveau via :id (mais exact)
    expect(resolveV2Path("/commandes/nouvelle")).toBe("/v2/commandes/nouvelle");
    expect(resolveV2Path("/clients/import")).toBe("/v2/clients/import");
    expect(resolveV2Path("/clients/nouveau")).toBe("/v2/clients/nouveau");
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

import { resolveV2Url } from "./v2-routes";
describe("resolveV2Url — résout le path vers /v2 EN PRÉSERVANT la query/hash (wiring liens backend)", () => {
  it("chemin migré + query → /v2 + query conservée", () => {
    expect(resolveV2Url("/devis?filtre=impayees")).toBe("/v2/devis?filtre=impayees");
    expect(resolveV2Url("/factures/123")).toBe("/v2/factures/123");
    expect(resolveV2Url("/clients/45?tab=devis")).toBe("/v2/clients/45?tab=devis");
  });
  it("déjà /v2 ou non migré → inchangé (query conservée)", () => {
    expect(resolveV2Url("/v2/devis?filtre=x")).toBe("/v2/devis?filtre=x");
    expect(resolveV2Url("/route-inconnue?a=1")).toBe("/route-inconnue?a=1");
  });
});
