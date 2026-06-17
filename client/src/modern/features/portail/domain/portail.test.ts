import { describe, expect, it } from "vitest";
import { PORTAIL_TABS } from "./portail";

describe("portail (socle, slice 1)", () => {
  it("expose les 8 onglets de l'espace client (parité legacy)", () => {
    expect(PORTAIL_TABS).toEqual(["demande", "devis", "factures", "interventions", "messages", "rdv", "chantier", "infos"]);
  });
});
