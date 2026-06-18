import { describe, it, expect } from "vitest";
import { ForbiddenError, NotFoundError } from "../../../shared/errors";
import { FakePdfPort } from "../../../shared/ports";
import { getPortalFacturePdf, type PortalFacturePdfDeps } from "./portal-facture-pdf";

function build(over: Partial<PortalFacturePdfDeps> = {}): PortalFacturePdfDeps {
  return {
    accessReader: { resolveAccessByToken: async () => ({ clientId: 5, artisanId: 1 }) },
    factureReader: { getById: async () => ({ clientId: 5, numero: "FAC-1" }), listLignes: async () => [{ designation: "x", quantite: "1", prixUnitaireHT: "10", tauxTVA: "20" }] },
    clientReader: { getById: async () => ({ id: 5, nom: "Dupont" }) },
    artisanReader: { getProfile: async () => ({ id: 1, nomEntreprise: "ACME" }) },
    cgvReader: { getCgv: async () => null },
    pdf: new FakePdfPort(),
    ...over,
  };
}

describe("getPortalFacturePdf", () => {
  it("succès → {buffer, filename} ; render('facture') reçoit facture+lignes+client+artisan", async () => {
    const pdf = new FakePdfPort();
    const res = await getPortalFacturePdf(build({ pdf }), "tok", 7);
    expect(res.filename).toBe("Facture_FAC-1.pdf");
    expect(pdf.rendered[0].template).toBe("facture");
    expect((pdf.rendered[0].data as { facture: { lignes: unknown[] } }).facture.lignes).toHaveLength(1);
  });

  it("token invalide / expiré → Forbidden (403)", async () => {
    await expect(getPortalFacturePdf(build({ accessReader: { resolveAccessByToken: async () => null } }), "bad", 7)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("facture d'un autre client de l'accès → NotFound (anti-IDOR portail)", async () => {
    await expect(getPortalFacturePdf(build({ factureReader: { getById: async () => ({ clientId: 999, numero: "X" }), listLignes: async () => [] } }), "tok", 7)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("facture absente → NotFound", async () => {
    await expect(getPortalFacturePdf(build({ factureReader: { getById: async () => null, listLignes: async () => [] } }), "tok", 7)).rejects.toBeInstanceOf(NotFoundError);
  });
});
