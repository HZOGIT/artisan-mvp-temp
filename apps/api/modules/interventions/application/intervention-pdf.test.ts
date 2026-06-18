import { describe, it, expect } from "vitest";
import { NotFoundError } from "../../../shared/errors";
import { FakePdfPort } from "../../../shared/ports";
import type { TenantContext } from "../../../shared/tenant";
import { getInterventionPdf, type InterventionPdfDeps } from "./intervention-pdf";

const ctx: TenantContext = { artisanId: 1, userId: 1 };

function build(over: Partial<InterventionPdfDeps> = {}): InterventionPdfDeps {
  return {
    interventionRepo: { getById: async () => ({ clientId: 5, technicienId: 3 }) },
    clientReader: { getById: async () => ({ id: 5, nom: "Dupont" }) },
    artisanReader: { getProfile: async () => ({ id: 1, nomEntreprise: "ACME" }) },
    technicienReader: { getById: async () => ({ nom: "Martin", prenom: "Léa" }) },
    pdf: new FakePdfPort(),
    ...over,
  };
}

describe("getInterventionPdf", () => {
  it("succès → {buffer, filename} ; render('intervention') reçoit intervention+client+artisan+technicienNom, mobile null", async () => {
    const pdf = new FakePdfPort();
    const res = await getInterventionPdf(build({ pdf }), ctx, 9);
    expect(res.filename).toBe("bon-intervention-9.pdf");
    expect(pdf.rendered[0].template).toBe("intervention");
    const data = pdf.rendered[0].data as { technicienNom: string; mobile: unknown; client: unknown };
    expect(data.technicienNom).toBe("Léa Martin");
    expect(data.mobile).toBeNull();
    expect(data.client).toBeTruthy();
  });

  it("sans technicien assigné → technicienNom null (pas de lookup)", async () => {
    const pdf = new FakePdfPort();
    await getInterventionPdf(build({ pdf, interventionRepo: { getById: async () => ({ clientId: 5, technicienId: null }) } }), ctx, 9);
    expect((pdf.rendered[0].data as { technicienNom: string | null }).technicienNom).toBeNull();
  });

  it("intervention hors tenant / absente → NotFound (anti-IDOR)", async () => {
    await expect(getInterventionPdf(build({ interventionRepo: { getById: async () => null } }), ctx, 99)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("client absent → NotFound", async () => {
    await expect(getInterventionPdf(build({ clientReader: { getById: async () => null } }), ctx, 9)).rejects.toBeInstanceOf(NotFoundError);
  });
});
