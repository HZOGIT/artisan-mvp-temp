import { describe, it, expect } from "vitest";
import { NotFoundError } from "../../../shared/errors";
import { FakePdfPort } from "../../../shared/ports";
import type { TenantContext } from "../../../shared/tenant";
import { getBonCommandePdf, type BonCommandePdfDeps } from "./bon-commande-pdf";

const ctx: TenantContext = { artisanId: 1, userId: 1 };

function build(over: Partial<BonCommandePdfDeps> = {}): BonCommandePdfDeps {
  return {
    commandeRepo: {
      getById: async () => ({ id: 7, fournisseurId: 3, numero: "BC-0007" }),
      listLignes: async () => [{ designation: "Tube", quantite: "2", prixUnitaire: "10", tauxTVA: "20" }],
    },
    fournisseurReader: { getById: async () => ({ id: 3, nom: "Plomberie Pro" }) },
    artisanReader: { getProfile: async () => ({ id: 1, nomEntreprise: "ACME" }) },
    pdf: new FakePdfPort(),
    ...over,
  };
}

describe("getBonCommandePdf", () => {
  it("succès → {buffer, filename} ; render('bon-commande') reçoit commande+lignes+artisan+fournisseur", async () => {
    const pdf = new FakePdfPort();
    const res = await getBonCommandePdf(build({ pdf }), ctx, 7);
    expect(Buffer.isBuffer(res.buffer)).toBe(true);
    expect(res.filename).toBe("BonCommande_BC-0007.pdf");
    expect(pdf.rendered).toHaveLength(1);
    expect(pdf.rendered[0].template).toBe("bon-commande");
    const data = pdf.rendered[0].data as { commande: { lignes: unknown[] }; artisan: unknown; fournisseur: unknown };
    expect(data.commande.lignes).toHaveLength(1);
    expect(data.fournisseur).toBeTruthy();
    expect(data.artisan).toBeTruthy();
  });

  it("filename fallback sur l'id si numero null", async () => {
    const res = await getBonCommandePdf(build({ commandeRepo: { getById: async () => ({ id: 9, fournisseurId: 3, numero: null }), listLignes: async () => [] } }), ctx, 9);
    expect(res.filename).toBe("BonCommande_9.pdf");
  });

  it("commande hors tenant / absente → NotFound (anti-IDOR)", async () => {
    await expect(getBonCommandePdf(build({ commandeRepo: { getById: async () => null, listLignes: async () => [] } }), ctx, 99)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("fournisseur absent → NotFound", async () => {
    await expect(getBonCommandePdf(build({ fournisseurReader: { getById: async () => null } }), ctx, 7)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("profil artisan absent → NotFound", async () => {
    await expect(getBonCommandePdf(build({ artisanReader: { getProfile: async () => null } }), ctx, 7)).rejects.toBeInstanceOf(NotFoundError);
  });
});
