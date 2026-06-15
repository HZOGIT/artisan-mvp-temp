import { describe, it, expect } from "vitest";
import { NotFoundError } from "../../../shared/errors";
import { FakePdfPort } from "../../../shared/ports";
import type { TenantContext } from "../../../shared/tenant";
import { getContratPdf, type ContratPdfDeps } from "./contrat-pdf";

const ctx: TenantContext = { artisanId: 1, userId: 1 };

function build(over: Partial<ContratPdfDeps> = {}): ContratPdfDeps {
  return {
    contratRepo: { getById: async () => ({ clientId: 5, reference: "CT-2026-0001" }) },
    clientReader: { getById: async () => ({ id: 5, nom: "Dupont" }) },
    artisanReader: { getProfile: async () => ({ id: 1, nomEntreprise: "ACME" }) },
    pdf: new FakePdfPort(),
    ...over,
  };
}

describe("getContratPdf", () => {
  it("succès → {buffer, filename=reference.pdf} ; render('contrat') reçoit contrat+artisan+client", async () => {
    const pdf = new FakePdfPort();
    const res = await getContratPdf(build({ pdf }), ctx, 7);
    expect(Buffer.isBuffer(res.buffer)).toBe(true);
    expect(res.filename).toBe("CT-2026-0001.pdf");
    expect(pdf.rendered[0].template).toBe("contrat");
    const data = pdf.rendered[0].data as { contrat: unknown; artisan: unknown; client: unknown };
    expect(data.contrat).toBeTruthy();
    expect(data.client).toBeTruthy();
    expect(data.artisan).toBeTruthy();
  });

  it("contrat hors tenant / absent → NotFound (anti-IDOR)", async () => {
    await expect(getContratPdf(build({ contratRepo: { getById: async () => null } }), ctx, 99)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("client absent → NotFound", async () => {
    await expect(getContratPdf(build({ clientReader: { getById: async () => null } }), ctx, 7)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("profil artisan absent → NotFound", async () => {
    await expect(getContratPdf(build({ artisanReader: { getProfile: async () => null } }), ctx, 7)).rejects.toBeInstanceOf(NotFoundError);
  });
});
