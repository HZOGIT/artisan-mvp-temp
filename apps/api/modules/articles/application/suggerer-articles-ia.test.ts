import { describe, it, expect } from "vitest";
import { suggererArticlesIA, type ArticlesIaDeps } from "./suggerer-articles-ia";
import { FakeLlmPort, FakeRateLimiter } from "../../../shared/ports/fakes";
import type { ArtisanReader, ArtisanInfo } from "../../../shared/readers/contact-readers";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };

function fakeArtisanReader(row: Partial<ArtisanInfo> | null): ArtisanReader {
  return {
    async getArtisan() {
      return row ? ({ id: 1, nomEntreprise: null, email: null, ...row } as ArtisanInfo) : null;
    },
  };
}

function deps(over: Partial<ArtisanReader> | { llm?: FakeLlmPort; rateLimiter?: FakeRateLimiter; artisanReader?: ArtisanReader } = {}): ArticlesIaDeps {
  return {
    llm: (over as { llm?: FakeLlmPort }).llm ?? new FakeLlmPort('{"articles":[{"designation":"Robinet","reference":"R-1","unite":"u","prixUnitaire":45.5,"description":"mitigeur","categorie":"plomberie"}]}'),
    rateLimiter: (over as { rateLimiter?: FakeRateLimiter }).rateLimiter ?? new FakeRateLimiter(),
    artisanReader: (over as { artisanReader?: ArtisanReader }).artisanReader ?? fakeArtisanReader({ metier: "plombier" }),
  };
}

describe("articles — suggererArticlesIA", () => {
  it("propose des articles coercés (sortie LLM JSON) ; le métier alimente le system prompt", async () => {
    const llm = new FakeLlmPort('{"articles":[{"designation":"Robinet mitigeur","reference":"R-1","unite":"u","prixUnitaire":45.5,"description":"chrome","categorie":"plomberie"}]}');
    const d = deps({ llm, artisanReader: fakeArtisanReader({ metier: "plombier" }) });
    const res = await suggererArticlesIA(d, A, { query: "robinet" });
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ designation: "Robinet mitigeur", reference: "R-1", unite: "u", prixUnitaire: 45.5, categorie: "plomberie" });
    // le contexte métier plombier est injecté en system instruction (prompt utilisateur contient "plombier")
    expect(llm.prompts[0]).toContain("plombier");
  });

  it("rate-limit atteint → [] (aucun appel LLM, parité dégradation silencieuse)", async () => {
    const rl = new FakeRateLimiter();
    rl.denyKey("ia:1");
    const llm = new FakeLlmPort("{}");
    const res = await suggererArticlesIA(deps({ llm, rateLimiter: rl }), A, { query: "robinet" });
    expect(res).toEqual([]);
    expect(llm.prompts).toHaveLength(0); // LLM non appelé
  });

  it("réponse non parsable → [] ; erreur provider → []", async () => {
    expect(await suggererArticlesIA(deps({ llm: new FakeLlmPort("pas du json du tout") }), A, { query: "x" })).toEqual([]);
    const boom: ArticlesIaDeps = {
      ...deps(),
      llm: { complete: async () => { throw new Error("provider 500"); }, async *stream() {} },
    };
    expect(await suggererArticlesIA(boom, A, { query: "x" })).toEqual([]);
  });

  it("métier inconnu/absent → contexte 'autre' (pas d'erreur)", async () => {
    const res = await suggererArticlesIA(deps({ artisanReader: fakeArtisanReader(null) }), A, { query: "divers" });
    expect(res).toHaveLength(1); // la réponse fixe par défaut reste parsée
  });
});
