import { describe, it, expect } from "vitest";
import { JsPdfAdapter } from "./js-pdf-adapter";

// Rendu PDF DÉTERMINISTE (jsPDF en mémoire, aucune dépendance externe) : on vérifie un binaire PDF
// valide et non vide par template. Prouve que le générateur internalisé fonctionne dans le new-stack.
const adapter = new JsPdfAdapter();
const artisan = { nomEntreprise: "ACME Plomberie", adresse: "1 rue A", codePostal: "75000", ville: "Paris", email: "pro@acme.fr", telephone: "0102030405", siret: "12345678900011", tauxTVA: 20, conditionsGenerales: null };
const client = { nom: "Dupont", prenom: "Jean", email: "jean@x.fr", telephone: "0607080910", adresse: "2 rue B", codePostal: "75001", ville: "Paris" };
const ligne = { designation: "Main d'œuvre", quantite: 2, unite: "h", prixUnitaireHT: 50, tauxTVA: 20 };

function expectPdf(buf: Buffer): void {
  expect(Buffer.isBuffer(buf)).toBe(true);
  expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-"); // magic
  expect(buf.length).toBeGreaterThan(1000);
}

describe("JsPdfAdapter (générateur jsPDF internalisé)", () => {
  it("render('devis') → PDF valide", async () => {
    expectPdf(await adapter.render("devis", { devis: { numero: "DEV-1", dateDevis: new Date(), dateValidite: new Date(), referenceClient: null, lignes: [ligne] }, artisan, client }));
  });

  it("render('facture') → PDF valide", async () => {
    expectPdf(await adapter.render("facture", { facture: { numero: "FAC-1", dateFacture: new Date(), dateEcheance: new Date(), referenceClient: null, statut: "envoyee", lignes: [ligne] }, artisan, client }));
  });

  it("render('bon-commande') → PDF valide", async () => {
    const fournisseur = { nom: "Plomberie Pro", email: "f@x.fr", telephone: null, adresse: null, codePostal: null, ville: null, contact: null };
    expectPdf(await adapter.render("bon-commande", { commande: { numero: "BC-1", dateCommande: new Date(), reference: null, totalHT: "100.00", totalTVA: "20.00", totalTTC: "120.00", lignes: [ligne] }, artisan, fournisseur }));
  });

  it("template inconnu → throw", async () => {
    await expect(adapter.render("inconnu", {})).rejects.toThrow("Template PDF inconnu");
  });
});
