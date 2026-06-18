import { describe, it, expect } from "vitest";
import { UnauthorizedError } from "../../../shared/errors";
import { PortalAccessRepositoryFake } from "../infra/portal-access-repository-fake";
import { PortalDocsReaderFake } from "../infra/portal-docs-reader-fake";
import { getDevis, getFactures, getInterventions, getContrats, type PortalDocsDeps } from "./doc-use-cases";

const NOW = new Date("2026-06-15T10:00:00Z");

// Accès valide : token "good" → client 5 / artisan 1.
function access() {
  return new PortalAccessRepositoryFake({ accesses: [{ id: 1, clientId: 5, artisanId: 1, token: "good", email: "x", expiresAt: new Date("2026-12-31"), isActive: true, lastAccessAt: null, createdAt: NOW }] });
}

function deps(): PortalDocsDeps {
  return {
    access: access(),
    docs: new PortalDocsReaderFake({
      devis: { 5: [{ id: 10, numero: "DEV-1", objet: "Toit", totalTTC: "1200", statut: "envoye", dateCreation: NOW, tokenSignature: null }] },
      factures: { 5: [{ id: 20, numero: "FAC-1", objet: "Presta", totalTTC: "900", statut: "envoyee", dateCreation: NOW, dateEcheance: null, lienPaiement: "https://pay/abc" }] },
      interventions: { 5: [{ id: 30, titre: "Visite", description: null, dateIntervention: NOW, statut: "planifiee", adresse: "1 rue A" }] },
      contrats: { 5: [{ id: 40, reference: "CT-1", titre: "Entretien", description: null, type: "entretien", montantHT: "500", tauxTVA: "20", periodicite: "annuel", dateDebut: NOW, dateFin: null, reconduction: true, prochainPassage: null, conditionsParticulieres: null, statut: "actif" }] },
    }),
  };
}

describe("portal docs (token valide)", () => {
  it("getDevis → devis du client (tokenSignature null parité)", async () => {
    const r = await getDevis(deps(), "good", NOW);
    expect(r.map((d) => d.numero)).toEqual(["DEV-1"]);
    expect(r[0].tokenSignature).toBeNull();
  });
  it("getFactures → factures + lienPaiement en attente", async () => {
    const r = await getFactures(deps(), "good", NOW);
    expect(r[0].lienPaiement).toBe("https://pay/abc");
  });
  it("getInterventions → interventions client-safe", async () => {
    const r = await getInterventions(deps(), "good", NOW);
    expect(r[0].titre).toBe("Visite");
  });
  it("getContrats → contrats client-safe (pas de notes)", async () => {
    const r = await getContrats(deps(), "good", NOW);
    expect(r[0].reference).toBe("CT-1");
    expect(r[0]).not.toHaveProperty("notes");
  });
});

describe("portal docs (token invalide/expiré → 401)", () => {
  it("token inconnu → Unauthorized pour chaque lecture", async () => {
    const d = deps();
    for (const fn of [getDevis, getFactures, getInterventions, getContrats]) {
      await expect(fn(d, "inconnu", NOW)).rejects.toBeInstanceOf(UnauthorizedError);
    }
  });
  it("token expiré → Unauthorized", async () => {
    const d: PortalDocsDeps = { ...deps(), access: new PortalAccessRepositoryFake({ accesses: [{ id: 1, clientId: 5, artisanId: 1, token: "exp", email: "x", expiresAt: new Date("2020-01-01"), isActive: true, lastAccessAt: null, createdAt: NOW }] }) };
    await expect(getDevis(d, "exp", NOW)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
