import { describe, it, expect } from "vitest";
import { buildSearchResults, fmtDate, fmtEur } from "./search";

describe("search domain (pur)", () => {
  it("fmtEur : format en-US 2 décimales + €", () => {
    expect(fmtEur(100)).toBe("100.00 €");
    expect(fmtEur("1234.5")).toBe("1,234.50 €");
    expect(fmtEur(null)).toBe("0.00 €");
  });

  it("fmtDate : JJ/MM/AAAA ; vide si absent", () => {
    expect(fmtDate(new Date(2026, 0, 5))).toBe("05/01/2026");
    expect(fmtDate(null)).toBe("");
  });

  it("buildSearchResults : projette chaque entité (titre/sous-titre/url), ordre clients→fournisseurs", () => {
    const out = buildSearchResults({
      clients: [{ id: 1, nom: "Durand", prenom: "Jean", email: "j@d.fr", telephone: null, ville: null }],
      devis: [{ id: 2, numero: "DEV-1", objet: "Réno", statut: "envoye", totalTTC: "120.00" }],
      factures: [{ id: 3, numero: "FAC-1", objet: null, statut: "payee", totalTTC: "240.00" }],
      interventions: [{ id: 4, titre: "Visite", statut: "planifiee", dateDebut: new Date(2026, 5, 14) }],
      fournisseurs: [{ id: 5, nom: "ACME", email: null, telephone: "0102" }],
    });
    expect(out.map((r) => r.type)).toEqual(["client", "devis", "facture", "intervention", "fournisseur"]);
    expect(out[0]).toMatchObject({ type: "client", title: "Jean Durand", subtitle: "j@d.fr", url: "/clients/1" });
    expect(out[1]).toMatchObject({ title: "DEV-1 — Réno", subtitle: "envoye — 120.00 €", url: "/devis/2" });
    expect(out[2]).toMatchObject({ title: "FAC-1", subtitle: "payee — 240.00 €", url: "/factures/3" });
    expect(out[3]).toMatchObject({ title: "Visite", subtitle: "planifiee — 14/06/2026", url: "/interventions/4" });
    expect(out[4]).toMatchObject({ title: "ACME", subtitle: "0102", url: "/fournisseurs/5" });
  });

  it("buildSearchResults : lots vides → liste vide", () => {
    expect(buildSearchResults({ clients: [], devis: [], factures: [], interventions: [], fournisseurs: [] })).toEqual([]);
  });
});
