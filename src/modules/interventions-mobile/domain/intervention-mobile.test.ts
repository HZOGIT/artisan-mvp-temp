import { describe, it, expect } from "vitest";
import { bornesDuJour } from "./intervention-mobile";

describe("bornesDuJour", () => {
  it("début = minuit du jour, fin = minuit du lendemain", () => {
    const { debut, fin } = bornesDuJour(new Date("2026-06-15T14:32:10Z"));
    expect(debut.getHours()).toBe(0);
    expect(debut.getMinutes()).toBe(0);
    expect(debut.getSeconds()).toBe(0);
    expect(fin.getTime() - debut.getTime()).toBe(86_400_000); // +1 jour
    expect(fin.getDate()).toBe(new Date(debut.getTime() + 86_400_000).getDate());
  });
});
