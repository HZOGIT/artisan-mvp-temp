import { describe, it, expect } from "vitest";
import { NotFoundError } from "../../../shared/errors";
import { FakePdfPort } from "../../../shared/ports";
import type { TenantContext } from "../../../shared/tenant";
import { collectFacturxLot, collectFacturePdfLot, type ExportLotPdfDeps } from "./export-lot-use-cases";

const ctx: TenantContext = { artisanId: 1, userId: 1 };

const FACTURES = [
  { id: 1, numero: "FAC-2026-0001", clientId: 5, dateFacture: new Date("2026-03-10"), statut: "validee" },
  { id: 2, numero: "FAC-2026-0002", clientId: 6, dateFacture: new Date("2026-06-10"), statut: "payee" },
  { id: 3, numero: "FAC-2026-DRAFT", clientId: 5, dateFacture: new Date("2026-06-11"), statut: "brouillon" }, // exclu
  { id: 4, numero: "FAC-2025-OLD", clientId: 5, dateFacture: new Date("2025-12-01"), statut: "validee" }, // hors période
];

function build(over: Partial<ExportLotPdfDeps> = {}): ExportLotPdfDeps {
  return {
    factureLister: { list: async () => FACTURES },
    factureReader: { listLignes: async () => [{ designation: "L", quantite: "1", prixUnitaireHT: "100", tauxTVA: "20", montantHT: "100.00", montantTVA: "20.00", montantTTC: "120.00" }] },
    clientReader: { getById: async (_c, id) => ({ id, nom: id === 6 ? "Durand & Fils" : "Dupont" }) },
    artisanReader: { getProfile: async () => ({ id: 1, nomEntreprise: "ACME", siret: "12345678900011", tauxTVA: "20" }) },
    pdf: new FakePdfPort(),
    ...over,
  };
}

const PERIOD = { dateDebut: new Date("2026-01-01"), dateFin: new Date("2026-12-31") };

describe("collectFacturxLot", () => {
  it("sélectionne les factures de la période (exclut brouillon + hors période) → 1 entrée XML / facture éligible", async () => {
    const res = await collectFacturxLot(build(), ctx, PERIOD);
    expect(res.entries).toHaveLength(2); // FAC-0001 + FAC-0002 (draft + 2025 exclus)
    expect(res.filename).toBe("FacturX_20260101_20261231.zip");
    expect(res.entries[0].name).toBe("FAC-2026-0001_Dupont.xml");
    expect(res.entries[1].name).toBe("FAC-2026-0002_Durand___Fils.xml"); // nom assaini : " & " → "___" (parité legacy)
    expect(String(res.entries[0].content)).toContain("FAC-2026-0001");
    expect(String(res.entries[0].content)).toContain("12345678900011");
  });

  it("annulee est exclue", async () => {
    const lister = { list: async () => [{ id: 9, numero: "FAC-X", clientId: 5, dateFacture: new Date("2026-05-01"), statut: "annulee" }] };
    await expect(collectFacturxLot(build({ factureLister: lister }), ctx, PERIOD)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("aucune facture sur la période → NotFound", async () => {
    await expect(collectFacturxLot(build({ factureLister: { list: async () => [] } }), ctx, PERIOD)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("client supprimé → facture sautée (parité legacy)", async () => {
    const res = await collectFacturxLot(build({ clientReader: { getById: async () => null } }), ctx, PERIOD);
    expect(res.entries).toHaveLength(0);
  });
});

describe("collectFacturePdfLot", () => {
  it("génère un PDF facture par facture éligible via render('facture')", async () => {
    const pdf = new FakePdfPort();
    const res = await collectFacturePdfLot(build({ pdf }), ctx, PERIOD);
    expect(res.entries).toHaveLength(2);
    expect(res.filename).toBe("Factures_PDF_20260101_20261231.zip");
    expect(res.entries[0].name).toBe("FAC-2026-0001_Dupont.pdf");
    expect(pdf.rendered).toHaveLength(2);
    expect(pdf.rendered[0].template).toBe("facture");
  });

  it("période par défaut (année courante) si non fournie", async () => {
    const now = new Date("2026-06-15T10:00:00Z");
    const res = await collectFacturePdfLot(build(), ctx, {}, now);
    expect(res.filename).toBe("Factures_PDF_20260101_20260615.zip");
  });
});
