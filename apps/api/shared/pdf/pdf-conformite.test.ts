import { describe, it, expect } from "vitest";
import { generateDevisPDF, generateFacturePDF } from "./pdf-generator";

const artisanBase = { nomEntreprise: "Plomberie Test", siret: "12345678900000" };
const artisanFranchise = { ...artisanBase, franchiseTVA: true as const };
const client = { nom: "Dupont", prenom: "Jean" };

function ligne10(montantHT: number) {
  return { designation: "Main d'œuvre", quantite: 1, unite: "h", prixUnitaireHT: montantHT, montantHT, tauxTVA: 10, montantTVA: montantHT * 0.1 };
}
function ligne20(montantHT: number) {
  return { designation: "Fournitures", quantite: 2, unite: "u", prixUnitaireHT: montantHT / 2, montantHT, tauxTVA: 20, montantTVA: montantHT * 0.2 };
}

/* OPE-803 — multi-taux: TTC affiché = HT + Σ(TVA par taux depuis lignes) */
describe("OPE-803 — TVA multi-taux sans divergence HT+TVA≠TTC", () => {
  it("génère un PDF valide pour une facture multi-taux", async () => {
    const l1 = ligne10(100); /* TVA = 10 */
    const l2 = ligne20(100); /* TVA = 20 */
    /* totalTVA DB intentionnellement divergent de 0.01 pour simuler l'arrondi */
    const buf = await generateFacturePDF({
      facture: {
        numero: "F-001",
        dateFacture: "2024-01-15",
        totalHT: 200,
        totalTVA: 30.01,
        totalTTC: 230.01,
        lignes: [l1, l2],
      },
      artisan: artisanBase,
      client,
    });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.slice(0, 4).toString("ascii")).toBe("%PDF");
  });
});

/* OPE-800 — mention 293B si artisan franchisé, même avec tvaCategorieId null */
describe("OPE-800 — mention art. 293 B si franchiseTVA", () => {
  it("génère un PDF devis sans throw pour artisan franchisé avec lignes sans tvaCategorieId", () => {
    const buf = generateDevisPDF({
      devis: {
        numero: "DEV-001",
        dateDevis: "2024-01-01",
        totalHT: 500,
        totalTVA: 0,
        totalTTC: 500,
        lignes: [{ designation: "Prestation", quantite: 1, unite: "forfait", prixUnitaireHT: 500, montantHT: 500, tauxTVA: 0, montantTVA: 0 }],
      },
      artisan: artisanFranchise,
      client,
    });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.slice(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("génère un PDF facture sans throw pour artisan franchisé avec lignes sans tvaCategorieId", async () => {
    const buf = await generateFacturePDF({
      facture: {
        numero: "F-002",
        dateFacture: "2024-01-01",
        totalHT: 500,
        totalTVA: 0,
        totalTTC: 500,
        lignes: [{ designation: "Prestation", quantite: 1, unite: "forfait", prixUnitaireHT: 500, montantHT: 500, tauxTVA: 0, montantTVA: 0 }],
      },
      artisan: artisanFranchise,
      client,
    });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.slice(0, 4).toString("ascii")).toBe("%PDF");
  });
});

/* OPE-804 — colonne Unité présente dans le tableau */
describe("OPE-804 — colonne Unité dans le tableau des lignes", () => {
  it("génère un PDF devis avec des lignes portant une unité sans throw", () => {
    const buf = generateDevisPDF({
      devis: {
        numero: "DEV-002",
        dateDevis: "2024-01-01",
        totalHT: 300,
        totalTVA: 60,
        totalTTC: 360,
        lignes: [
          { designation: "Peinture", quantite: 10, unite: "m²", prixUnitaireHT: 20, montantHT: 200, tauxTVA: 20, montantTVA: 40 },
          { designation: "Main d'œuvre", quantite: 2, unite: "h", prixUnitaireHT: 50, montantHT: 100, tauxTVA: 20, montantTVA: 20 },
        ],
      },
      artisan: artisanBase,
      client,
    });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.slice(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("génère un PDF facture avec des lignes portant une unité sans throw", async () => {
    const buf = await generateFacturePDF({
      facture: {
        numero: "F-003",
        dateFacture: "2024-01-01",
        totalHT: 300,
        totalTVA: 60,
        totalTTC: 360,
        lignes: [
          { designation: "Peinture", quantite: 10, unite: "m²", prixUnitaireHT: 20, montantHT: 200, tauxTVA: 20, montantTVA: 40 },
          { designation: "Main d'œuvre", quantite: 2, unite: "h", prixUnitaireHT: 50, montantHT: 100, tauxTVA: 20, montantTVA: 20 },
        ],
      },
      artisan: artisanBase,
      client,
    });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.slice(0, 4).toString("ascii")).toBe("%PDF");
  });
});

/* OPE-805 — objet affiché dans le corps du PDF */
describe("OPE-805 — objet de la facture/devis affiché", () => {
  it("génère un PDF devis avec objet sans throw", () => {
    const buf = generateDevisPDF({
      devis: {
        numero: "DEV-003",
        dateDevis: "2024-01-01",
        objet: "Travaux de plomberie — appartement rue de la Paix",
        totalHT: 100,
        totalTVA: 20,
        totalTTC: 120,
        lignes: [{ designation: "Plomberie", quantite: 1, unite: "forfait", prixUnitaireHT: 100, montantHT: 100, tauxTVA: 20, montantTVA: 20 }],
      },
      artisan: artisanBase,
      client,
    });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.slice(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("génère un PDF facture normale avec objet sans throw", async () => {
    const buf = await generateFacturePDF({
      facture: {
        numero: "F-004",
        dateFacture: "2024-01-01",
        objet: "Rénovation salle de bain",
        totalHT: 100,
        totalTVA: 20,
        totalTTC: 120,
        lignes: [{ designation: "Plomberie", quantite: 1, unite: "forfait", prixUnitaireHT: 100, montantHT: 100, tauxTVA: 20, montantTVA: 20 }],
      },
      artisan: artisanBase,
      client,
    });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.slice(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("génère un PDF avoir avec objet sans throw (objet dans le bandeau en-tête seulement)", async () => {
    const buf = await generateFacturePDF({
      facture: {
        numero: "AV-001",
        dateFacture: "2024-01-01",
        typeDocument: "avoir",
        objet: "Avoir sur facture F-004",
        totalHT: 100,
        totalTVA: 20,
        totalTTC: 120,
        lignes: [{ designation: "Annulation", quantite: 1, unite: "forfait", prixUnitaireHT: 100, montantHT: 100, tauxTVA: 20, montantTVA: 20 }],
      },
      artisan: artisanBase,
      client,
    });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.slice(0, 4).toString("ascii")).toBe("%PDF");
  });
});
