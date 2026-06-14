import { describe, it, expect } from "vitest";
import { createComptabiliteModule } from "./comptabilite.module";
import { FakeComptabiliteReader } from "./infra/comptabilite-reader-fake";

describe("comptabilite.module", () => {
  it("câble le reader injecté", () => {
    const reader = new FakeComptabiliteReader();
    const module = createComptabiliteModule({ reader });
    expect(module.deps.reader).toBe(reader);
  });

  it("expose les 5 procédures de lecture (gate comptabilite.voir)", () => {
    const module = createComptabiliteModule({ reader: new FakeComptabiliteReader() });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual(["getBalance", "getDeclarationTVADetail", "getGrandLivre", "getJournalVentes", "getRapportTVA"]);
  });
});
