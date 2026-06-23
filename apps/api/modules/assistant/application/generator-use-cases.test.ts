import { describe, it, expect } from "vitest";
import { NotFoundError, TooManyRequestsError } from "../../../shared/errors";
import type { LlmPort, LlmCompleteOptions, LlmResult } from "../../../shared/ports/llm";
import type { RateLimiterPort } from "../../../shared/ports/rate-limiter";
import type { ArtisanReader, ArtisanInfo } from "../../../shared/readers/contact-readers";
import type { TenantContext } from "../../../shared/tenant";
import { FakeAssistantDataReader } from "../infra/assistant-data-reader-fake";
import { suggestRelances, generateDevis, analyseRentabilite, predictionTresorerie } from "./generator-use-cases";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const NOW = new Date("2026-06-15T12:00:00Z");

const STUB_USAGE: LlmResult["usage"] = {
  model: "stub", durationMs: 0, finishReason: "STOP",
  promptTokens: 0, responseTokens: 0, thinkingTokens: 0, cachedTokens: 0, toolUseTokens: 0, totalTokens: 0,
  textInputTokens: 0, audioInputTokens: 0, imageInputTokens: 0, videoInputTokens: 0,
  textOutputTokens: 0, audioOutputTokens: 0, trafficType: null,
};

class StubLlm implements LlmPort {
  public calls = 0;
  public lastUser?: string;
  public lastOpts?: LlmCompleteOptions;
  constructor(private readonly out: string) {}
  async complete(user: string, opts?: LlmCompleteOptions): Promise<LlmResult> {
    this.calls++;
    this.lastUser = user;
    this.lastOpts = opts;
    return { text: this.out, usage: STUB_USAGE };
  }
  // eslint-disable-next-line require-yield
  async *stream(): AsyncIterable<never> {
    throw new Error("unused");
  }
}
const allow: RateLimiterPort = { check: async () => true };
const deny: RateLimiterPort = { check: async () => false };
class FakeArtisan implements ArtisanReader {
  constructor(private readonly a: ArtisanInfo | null) {}
  async getArtisan(): Promise<ArtisanInfo | null> {
    return this.a;
  }
}
const artisan: ArtisanInfo = { id: 1, nomEntreprise: "X", email: null };

function deps(over: { llm?: LlmPort; rl?: RateLimiterPort; artisan?: ArtisanInfo | null; data?: FakeAssistantDataReader }) {
  const data = over.data ?? new FakeAssistantDataReader();
  return {
    data,
    d: {
      llm: over.llm ?? new StubLlm("[]"),
      rateLimiter: over.rl ?? allow,
      artisanReader: new FakeArtisan(over.artisan === undefined ? artisan : over.artisan),
      dataReader: data,
      maintenant: () => NOW,
    },
  };
}

describe("suggestRelances", () => {
  it("pas d'artisan → []", async () => {
    const { d } = deps({ artisan: null });
    expect(await suggestRelances(d, ctx(1))).toEqual([]);
  });
  it("rate-limit → 429", async () => {
    const { d } = deps({ rl: deny });
    await expect(suggestRelances(d, ctx(1))).rejects.toBeInstanceOf(TooManyRequestsError);
  });
  it("filtre les devis < 7 jours → [] (aucun à relancer)", async () => {
    const { d, data } = deps({});
    data.seedDevisNonSignes(1, [{ numero: "D1", objet: null, totalTTC: "100", dateDevis: new Date("2026-06-13T12:00:00Z"), clientNom: "C", clientEmail: null }]);
    expect(await suggestRelances(d, ctx(1))).toEqual([]);
  });
  it("devis ≥ 7 jours → emails parsés (JSON)", async () => {
    const llm = new StubLlm('[{"numero":"D1","objet":"o","email":{"sujet":"s","corps":"c"}}]');
    const { d, data } = deps({ llm });
    data.seedDevisNonSignes(1, [{ numero: "D1", objet: "Toit", totalTTC: "1000", dateDevis: new Date("2026-06-01T12:00:00Z"), clientNom: "Jean", clientEmail: null }]);
    const out = await suggestRelances(d, ctx(1));
    expect(out).toHaveLength(1);
    expect(llm.lastUser).toContain("il y a 14 jours à Jean");
  });
  it("JSON non parsable → [{error}]", async () => {
    const llm = new StubLlm("pas du json");
    const { d, data } = deps({ llm });
    data.seedDevisNonSignes(1, [{ numero: "D1", objet: null, totalTTC: "100", dateDevis: new Date("2026-06-01T12:00:00Z"), clientNom: "C", clientEmail: null }]);
    const out = await suggestRelances(d, ctx(1));
    expect(out).toEqual([{ error: "pas du json" }]);
  });
});

describe("generateDevis", () => {
  it("pas d'artisan → NotFound", async () => {
    const { d } = deps({ artisan: null });
    await expect(generateDevis(d, ctx(1), { description: "x" })).rejects.toBeInstanceOf(NotFoundError);
  });
  it("rate-limit → 429", async () => {
    const { d } = deps({ rl: deny });
    await expect(generateDevis(d, ctx(1), { description: "x" })).rejects.toBeInstanceOf(TooManyRequestsError);
  });
  it("renvoie {lignes, raw} (lignes parsées)", async () => {
    const llm = new StubLlm('[{"designation":"Pose","quantite":1,"unite":"u","prixUnitaireHT":100,"tauxTVA":20}]');
    const { d, data } = deps({ llm });
    data.seedCatalogue(1, "Pose - 100€/u");
    const out = await generateDevis(d, ctx(1), { description: "réfection" });
    expect(out.lignes).toHaveLength(1);
    expect(out.raw).toContain("Pose");
    expect(llm.lastOpts?.system).toContain("Pose - 100€/u");
  });
  it("JSON non parsable → lignes []", async () => {
    const { d } = deps({ llm: new StubLlm("désolé") });
    const out = await generateDevis(d, ctx(1), { description: "x" });
    expect(out.lignes).toEqual([]);
  });
});

describe("analyseRentabilite", () => {
  it("devis hors tenant → NotFound (anti-IDOR)", async () => {
    const { d } = deps({ llm: new StubLlm("analyse") }); // pas de seedAnalyse
    await expect(analyseRentabilite(d, ctx(1), { devisId: 5 })).rejects.toBeInstanceOf(NotFoundError);
  });
  it("renvoie {analyse}", async () => {
    const { d, data } = deps({ llm: new StubLlm("## Analyse markdown") });
    data.seedAnalyse(1, 5, { numero: "D5", totalHT: "1000", totalTTC: "1200", clientNom: "Jean", lignes: [{ designation: "Pose", quantite: "1", unite: "u", prixUnitaireHT: "100", tauxTVA: "20" }], tarifs: "Pose: 90€/u" });
    const out = await analyseRentabilite(d, ctx(1), { devisId: 5 });
    expect(out.analyse).toBe("## Analyse markdown");
  });
});

describe("predictionTresorerie", () => {
  it("pas d'artisan → NotFound", async () => {
    const { d } = deps({ artisan: null });
    await expect(predictionTresorerie(d, ctx(1))).rejects.toBeInstanceOf(NotFoundError);
  });
  it("renvoie {prediction}", async () => {
    const { d, data } = deps({ llm: new StubLlm("## Prévision") });
    data.seedTresorerie(1, { facturesPayees: "FAC1: 100€", facturesImpayees: "", devisAcceptes: "" });
    const out = await predictionTresorerie(d, ctx(1));
    expect(out.prediction).toBe("## Prévision");
  });
});
