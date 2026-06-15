import { describe, it, expect } from "vitest";
import { NotFoundError } from "../../../shared/errors";
import { FakePdfPort } from "../../../shared/ports";
import type { TenantContext } from "../../../shared/tenant";
import { getFacturxXml, getFacturxPdf, type FacturxPdfDeps } from "./facturx-use-cases";

const ctx: TenantContext = { artisanId: 1, userId: 1 };

function build(over: Partial<FacturxPdfDeps> = {}): FacturxPdfDeps {
  return {
    factureReader: {
      getById: async () => ({ clientId: 5, numero: "FAC-2026-0001" }),
      listLignes: async () => [{ designation: "Main d'œuvre", quantite: "1", prixUnitaireHT: "100", tauxTVA: "20", montantHT: "100.00", montantTVA: "20.00", montantTTC: "120.00" }],
    },
    clientReader: { getById: async () => ({ id: 5, nom: "Dupont", prenom: "Jean", adresse: "1 rue A", codePostal: "75000", ville: "Paris" }) },
    artisanReader: { getProfile: async () => ({ id: 1, nomEntreprise: "ACME", siret: "12345678900011", tauxTVA: "20", adresse: "2 rue B", codePostal: "75001", ville: "Paris" }) },
    pdf: new FakePdfPort(),
    ...over,
  };
}

describe("getFacturxXml", () => {
  it("succès → XML CII non vide + filename ; contient n° facture + SIRET", async () => {
    const facture = { clientId: 5, numero: "FAC-2026-0001", totalHT: "100.00", totalTVA: "20.00", totalTTC: "120.00", dateFacture: new Date("2026-06-15") };
    const res = await getFacturxXml(build({ factureReader: { getById: async () => facture, listLignes: async () => [] } }), ctx, 7);
    expect(res.filename).toBe("FacturX_FAC-2026-0001.xml");
    expect(res.xml).toContain("<?xml");
    expect(res.xml).toContain("FAC-2026-0001");
    expect(res.xml).toContain("12345678900011");
    expect(res.xml.length).toBeGreaterThan(200);
  });

  it("facture hors tenant / absente → NotFound (anti-IDOR)", async () => {
    await expect(getFacturxXml(build({ factureReader: { getById: async () => null, listLignes: async () => [] } }), ctx, 99)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("client absent → NotFound", async () => {
    await expect(getFacturxXml(build({ clientReader: { getById: async () => null } }), ctx, 7)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("getFacturxPdf", () => {
  it("succès → {buffer, filename Factur-X} via render('facture')", async () => {
    const pdf = new FakePdfPort();
    const res = await getFacturxPdf(build({ pdf }), ctx, 7);
    expect(res.filename).toBe("Facture_FAC-2026-0001_FacturX.pdf");
    expect(pdf.rendered[0].template).toBe("facture");
  });
});
