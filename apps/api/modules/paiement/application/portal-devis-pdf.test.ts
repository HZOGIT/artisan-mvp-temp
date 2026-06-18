import { describe, it, expect } from "vitest";
import { ForbiddenError, NotFoundError } from "../../../shared/errors";
import { FakePdfPort } from "../../../shared/ports";
import { getPortalDevisPdf, type PortalDevisPdfDeps } from "./portal-devis-pdf";

function build(over: Partial<PortalDevisPdfDeps> = {}): PortalDevisPdfDeps {
  return {
    accessReader: { resolveAccessByToken: async () => ({ clientId: 5, artisanId: 1 }) },
    devisReader: { getById: async () => ({ clientId: 5, numero: "DEV-1" }), listLignes: async () => [{ designation: "x", quantite: "1", prixUnitaireHT: "10", tauxTVA: "20" }] },
    clientReader: { getById: async () => ({ id: 5, nom: "Dupont" }) },
    artisanReader: { getProfile: async () => ({ id: 1, nomEntreprise: "ACME" }) },
    cgvReader: { getCgv: async () => "Conditions générales de vente." },
    pdf: new FakePdfPort(),
    ...over,
  };
}

describe("getPortalDevisPdf", () => {
  it("succès → {buffer, filename} ; render('devis') reçoit devis+lignes+client+artisan+cgv", async () => {
    const pdf = new FakePdfPort();
    const res = await getPortalDevisPdf(build({ pdf }), "tok", 7);
    expect(res.filename).toBe("Devis_DEV-1.pdf");
    expect(pdf.rendered[0].template).toBe("devis");
    const data = pdf.rendered[0].data as { devis: { lignes: unknown[] }; cgv: string };
    expect(data.devis.lignes).toHaveLength(1);
    expect(data.cgv).toContain("Conditions");
  });

  it("token invalide / expiré → Forbidden (403)", async () => {
    await expect(getPortalDevisPdf(build({ accessReader: { resolveAccessByToken: async () => null } }), "bad", 7)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("devis d'un autre client de l'accès → NotFound (anti-IDOR portail)", async () => {
    await expect(getPortalDevisPdf(build({ devisReader: { getById: async () => ({ clientId: 999, numero: "X" }), listLignes: async () => [] } }), "tok", 7)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("devis absent → NotFound", async () => {
    await expect(getPortalDevisPdf(build({ devisReader: { getById: async () => null, listLignes: async () => [] } }), "tok", 7)).rejects.toBeInstanceOf(NotFoundError);
  });
});
