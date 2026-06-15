import { describe, it, expect } from "vitest";
import type { TenantContext } from "../../../shared/tenant";
import { ImportErpRepositoryFake } from "../infra/import-erp-repository-fake";
import type { ClientRef } from "../domain/import";
import { importClients, importDevis, importFactures } from "./use-cases";

const ctx: TenantContext = { artisanId: 1, userId: 1 };
const mapClient = { Nom: "nom", Email: "email", Tel: "telephone" };
const mapDevis = { Client: "nomClient", Objet: "objetDevis", TTC: "totalTTC", Date: "dateDevis", Statut: "statut" };
const mapFacture = { Client: "nomClient", Objet: "objetFacture", TTC: "totalTTC", Date: "dateFacture" };

describe("importClients", () => {
  it("importe les lignes valides, compte erreurs (nom manquant) et doublons (email)", async () => {
    const repo = new ImportErpRepositoryFake([{ id: 5, nom: "Existant", prenom: null, email: "existe@x.fr" }]);
    const res = await importClients(repo, ctx, {
      mapping: mapClient,
      rows: [
        { Nom: "Dupont", Email: "dup@x.fr" }, // ok
        { Nom: "", Email: "x@x.fr" }, // erreur : nom manquant
        { Nom: "Doublon", Email: "existe@x.fr" }, // doublon (email existant)
        { Nom: "Martin", Email: "MART@x.fr" }, // ok
        { Nom: "Martin2", Email: "mart@x.fr" }, // doublon (déjà vu dans le lot, casse-insensible)
      ],
    });
    expect(res.imported).toBe(2);
    expect(res.errors).toBe(1);
    expect(res.duplicates).toBe(2);
    expect(res.errorDetails[0]).toContain("nom manquant");
    expect(repo.createdClients.map((c) => c.nom)).toEqual(["Dupont", "Martin"]);
  });

  it("erreur d'insertion → comptée en erreur de ligne (pas de crash)", async () => {
    const repo = new ImportErpRepositoryFake([], (kind) => kind === "client");
    const res = await importClients(repo, ctx, { mapping: mapClient, rows: [{ Nom: "X" }] });
    expect(res.imported).toBe(0);
    expect(res.errors).toBe(1);
    expect(res.errorDetails[0]).toContain("insert client échoué");
  });
});

describe("importDevis", () => {
  const clients: ClientRef[] = [{ id: 7, nom: "Dupont", prenom: "Jean", email: null }];
  it("crée un devis léger pour un client résolu ; client introuvable → erreur", async () => {
    const repo = new ImportErpRepositoryFake(clients);
    const res = await importDevis(repo, ctx, {
      mapping: mapDevis,
      rows: [
        { Client: "Jean Dupont", Objet: "Travaux", TTC: "1200", Date: "2026-03-01", Statut: "brouillon" }, // ok
        { Client: "Inconnu", TTC: "500" }, // erreur : introuvable
        { Objet: "Sans client" }, // erreur : nomClient manquant
      ],
    });
    expect(res.imported).toBe(1);
    expect(res.errors).toBe(2);
    expect(repo.createdDevis).toHaveLength(1);
    const d = repo.createdDevis[0];
    expect(d.clientId).toBe(7);
    expect(d.objet).toBe("Travaux");
    expect(d.totalTTC).toBe("1200");
    // validité = dateDevis + 30 jours
    expect(d.dateValidite.getTime() - d.dateDevis.getTime()).toBe(30 * 86_400_000);
  });

  it("défauts : objet 'Devis importé', statut 'brouillon', TTC '0'", async () => {
    const repo = new ImportErpRepositoryFake(clients);
    await importDevis(repo, ctx, { mapping: mapDevis, rows: [{ Client: "Dupont" }] });
    expect(repo.createdDevis[0]).toMatchObject({ objet: "Devis importé", statut: "brouillon", totalTTC: "0" });
  });
});

describe("importFactures", () => {
  const clients: ClientRef[] = [{ id: 9, nom: "Martin", prenom: null, email: null }];
  it("crée une facture légère ; échéance = dateFacture + 30 jours", async () => {
    const repo = new ImportErpRepositoryFake(clients);
    const res = await importFactures(repo, ctx, {
      mapping: mapFacture,
      rows: [{ Client: "Martin", Objet: "Presta", TTC: "800", Date: "2026-02-01" }],
    });
    expect(res.imported).toBe(1);
    const f = repo.createdFactures[0];
    expect(f.clientId).toBe(9);
    expect(f.objet).toBe("Presta");
    expect(f.totalTTC).toBe("800");
    expect(f.dateEcheance.getTime() - f.dateFacture.getTime()).toBe(30 * 86_400_000);
  });
});
