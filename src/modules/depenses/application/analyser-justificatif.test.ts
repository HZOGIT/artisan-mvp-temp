import { describe, it, expect } from "vitest";
import { analyserJustificatif } from "./analyser-justificatif";
import { FakeVisionPort, FakeRateLimiter } from "../../../shared/ports/fakes";
import { FakeDepenseRepository } from "../infra/depense-repository-fake";
import { NotFoundError, TooManyRequestsError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };
const OK_JSON = '{"fournisseur":"ACME","date":"2026-03-15","montantHT":100,"tauxTVA":20,"montantTTC":120,"categorie":"materiaux"}';

function deps(over: { vision?: FakeVisionPort; rateLimiter?: FakeRateLimiter; depenseRepo?: FakeDepenseRepository } = {}) {
  return {
    vision: over.vision ?? new FakeVisionPort(OK_JSON),
    rateLimiter: over.rateLimiter ?? new FakeRateLimiter(),
    depenseRepo: over.depenseRepo ?? new FakeDepenseRepository(),
  };
}

describe("depenses — analyserJustificatif (OCR vision)", () => {
  it("extrait le JSON ; data URL → mimeType/base64 transmis au modèle", async () => {
    const vision = new FakeVisionPort(OK_JSON);
    const res = await analyserJustificatif(deps({ vision }), A, { imageBase64: "data:image/png;base64,ABCD123" });
    expect(res.success).toBe(true);
    expect(res.data).toMatchObject({ fournisseur: "ACME", montantTTC: 120, categorie: "materiaux" });
    expect(vision.requests[0]).toMatchObject({ mimeType: "image/png", base64: "ABCD123" });
  });

  it("base64 brut (sans data URL) → mimeType par défaut image/jpeg", async () => {
    const vision = new FakeVisionPort(OK_JSON);
    await analyserJustificatif(deps({ vision }), A, { imageBase64: "RAWBASE64" });
    expect(vision.requests[0]).toMatchObject({ mimeType: "image/jpeg", base64: "RAWBASE64" });
  });

  it("rate-limit IA atteint → 429 (aucun appel modèle)", async () => {
    const rl = new FakeRateLimiter();
    rl.denyKey("ia:1");
    const vision = new FakeVisionPort(OK_JSON);
    await expect(analyserJustificatif(deps({ vision, rateLimiter: rl }), A, { imageBase64: "x" })).rejects.toBeInstanceOf(TooManyRequestsError);
    expect(vision.requests).toHaveLength(0);
  });

  it("anti-IDOR : depenseId d'un autre tenant → NotFound AVANT l'appel modèle", async () => {
    const depRepo = new FakeDepenseRepository();
    const dep = await depRepo.create(A, { userId: 10, numero: "DEP-1", dateDepense: "2026-03-15", categorie: "x", montantHt: "10.00", montantTtc: "12.00" });
    const vision = new FakeVisionPort(OK_JSON);
    // B ne possède pas la dépense de A
    await expect(analyserJustificatif(deps({ vision, depenseRepo: depRepo }), B, { imageBase64: "x", depenseId: dep.id })).rejects.toBeInstanceOf(NotFoundError);
    expect(vision.requests).toHaveLength(0); // pas d'appel gaspillé
  });

  it("depenseId du tenant → OCR persisté (markOcr), ocr_traite=true", async () => {
    const depRepo = new FakeDepenseRepository();
    const dep = await depRepo.create(A, { userId: 10, numero: "DEP-1", dateDepense: "2026-03-15", categorie: "x", montantHt: "10.00", montantTtc: "12.00" });
    const res = await analyserJustificatif(deps({ depenseRepo: depRepo }), A, { imageBase64: "x", depenseId: dep.id });
    expect(res.success).toBe(true);
    const after = await depRepo.getById(A, dep.id);
    expect(after?.ocrTraite).toBe(true);
    expect(after?.ocrBrut).toContain("ACME");
  });

  it("réponse non-JSON → success avec data {} ; erreur modèle → {success:false} assaini", async () => {
    expect((await analyserJustificatif(deps({ vision: new FakeVisionPort("pas du json") }), A, { imageBase64: "x" })).data).toEqual({});
    const boom = await analyserJustificatif(deps({ vision: new FakeVisionPort("{}", { throwError: new Error("data:image/png;base64,SECRET boom") }) }), A, { imageBase64: "x" });
    expect(boom.success).toBe(false);
    expect(boom.error).toMatch(/OCR IA echouee/);
    expect(boom.error).not.toContain("SECRET"); // base64 assaini
  });
});
