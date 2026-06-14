import { describe, it, expect } from "vitest";
import { genererLignesDevisIA, type DevisIaDeps } from "./generer-lignes-ia";
import { FakeLlmPort, FakeRateLimiter } from "../../../shared/ports";
import { TooManyRequestsError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };

function deps(over: Partial<DevisIaDeps> = {}): DevisIaDeps {
  return {
    llm: new FakeLlmPort('{"objet":"Réfection toiture","dureeEstimee":"3 jours","lignes":[{"designation":"Tuiles","quantite":100,"unite":"u","prixUnitaire":1.2,"tauxTva":10,"type":"fourniture"}],"notes":"RAS","conseilsArtisan":"Prévoir échafaudage"}'),
    rateLimiter: new FakeRateLimiter(),
    ...over,
  };
}

describe("genererLignesDevisIA", () => {
  it("propose objet + lignes (non persisté) depuis une description", async () => {
    const d = deps();
    const out = await genererLignesDevisIA(d, A, { description: "Refaire la toiture", surface: 80 });
    expect(out.objet).toBe("Réfection toiture");
    expect(out.dureeEstimee).toBe("3 jours");
    expect(out.lignes).toHaveLength(1);
    expect(out.lignes[0].designation).toBe("Tuiles");
    expect(out.lignes[0].tauxTva).toBe(10);
    expect(out.conseilsArtisan).toBe("Prévoir échafaudage");
    expect((d.llm as FakeLlmPort).prompts[0]).toContain("Refaire la toiture");
    expect((d.llm as FakeLlmPort).prompts[0]).toContain("80 m²");
  });

  it("rate-limit IA → 429", async () => {
    const limiter = new FakeRateLimiter();
    limiter.denyKey("ia:1");
    await expect(genererLignesDevisIA(deps({ rateLimiter: limiter }), A, { description: "Travaux" })).rejects.toBeInstanceOf(TooManyRequestsError);
  });

  it("réponse non-JSON → proposition vide (objet = début de la description)", async () => {
    const out = await genererLignesDevisIA(deps({ llm: new FakeLlmPort("désolé") }), A, { description: "Pose carrelage salle de bain" });
    expect(out.lignes).toEqual([]);
    expect(out.objet).toBe("Pose carrelage salle de bain");
  });
});
