import { describe, expect, it } from "vitest";
import { readV2FlagFromSearch } from "./v2-flag";

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
