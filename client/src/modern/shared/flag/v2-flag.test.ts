import { describe, expect, it } from "vitest";
import { readV2FlagFromSearch, resolveV2Enabled } from "./v2-flag";

// Cœur PUR du flag (sans DOM) : la résolution depuis la query string. Les wrappers `isV2Enabled`/
// `setV2Enabled` (localStorage/window) sont une fine couche d'I/O non testée ici (env vitest = node).
describe("readV2FlagFromSearch", () => {
  it("active sur ?v2=1 ou ?v2=true", () => {
    expect(readV2FlagFromSearch("?v2=1")).toBe(true);
    expect(readV2FlagFromSearch("?v2=true")).toBe(true);
  });

  it("désactive sur ?v2=0 ou ?v2=false", () => {
    expect(readV2FlagFromSearch("?v2=0")).toBe(false);
    expect(readV2FlagFromSearch("?v2=false")).toBe(false);
  });

  it("renvoie null quand le paramètre est absent", () => {
    expect(readV2FlagFromSearch("")).toBeNull();
    expect(readV2FlagFromSearch("?autre=1")).toBeNull();
  });

  it("renvoie null pour une valeur non reconnue (pas d'activation accidentelle)", () => {
    expect(readV2FlagFromSearch("?v2=oui")).toBeNull();
    expect(readV2FlagFromSearch("?v2=")).toBeNull();
  });

  it("fonctionne en présence d'autres paramètres", () => {
    expect(readV2FlagFromSearch("?source=menu&v2=1")).toBe(true);
  });
});

// Bascule par défaut (OPE-403) : sans avis URL, l'absence de préférence vaut ACTIVÉ ; seul l'opt-out
// explicite mémorisé (`"0"`) force le legacy. L'URL prime toujours.
describe("resolveV2Enabled (défaut activé + escape hatch)", () => {
  it("l'URL prime sur le storage", () => {
    expect(resolveV2Enabled(true, "0")).toBe(true);
    expect(resolveV2Enabled(false, "1")).toBe(false);
  });

  it("sans avis URL : activé par défaut (rien en storage)", () => {
    expect(resolveV2Enabled(null, null)).toBe(true);
  });

  it("sans avis URL : activé si mémorisé `1`, désactivé seulement si opt-out explicite `0`", () => {
    expect(resolveV2Enabled(null, "1")).toBe(true);
    expect(resolveV2Enabled(null, "0")).toBe(false);
  });
});
