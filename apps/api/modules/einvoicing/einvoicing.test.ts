import { describe, it, expect } from "vitest";
import { isTerminal } from "../../../../drizzle/schema/einvoicing";

describe("isTerminal", () => {
  it("refusee et rejetee sont terminaux", () => {
    expect(isTerminal("refusee")).toBe(true);
    expect(isTerminal("rejetee")).toBe(true);
  });

  it("autres statuts ne sont pas terminaux", () => {
    expect(isTerminal("non_soumise")).toBe(false);
    expect(isTerminal("deposee")).toBe(false);
    expect(isTerminal("approuvee")).toBe(false);
    expect(isTerminal("encaissee")).toBe(false);
  });
});
