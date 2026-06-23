import { describe, it, expect } from "vitest";
import type { TenantContext } from "../../../shared/tenant";
import type { LlmPort, LlmCompleteOptions, LlmResult } from "../../../shared/ports/llm";
import type { RateLimiterPort } from "../../../shared/ports/rate-limiter";
import type { ArtisanReader, ArtisanInfo } from "../../../shared/readers/contact-readers";
import { FakeConseilsStatsReader } from "../infra/conseils-stats-reader-fake";
import { getConseilsIA } from "./use-cases";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

const STUB_USAGE: LlmResult["usage"] = {
  model: "stub", durationMs: 0, finishReason: "STOP",
  promptTokens: 0, responseTokens: 0, thinkingTokens: 0, cachedTokens: 0, toolUseTokens: 0, totalTokens: 0,
  textInputTokens: 0, audioInputTokens: 0, imageInputTokens: 0, videoInputTokens: 0,
  textOutputTokens: 0, audioOutputTokens: 0, trafficType: null,
};

class FakeArtisanReader implements ArtisanReader {
  constructor(private readonly artisan: ArtisanInfo | null) {}
  async getArtisan(): Promise<ArtisanInfo | null> {
    return this.artisan;
  }
}
class StubLlm implements LlmPort {
  public calls = 0;
  public lastOpts?: LlmCompleteOptions;
  constructor(private readonly out: string | Error) {}
  async complete(_p: string, opts?: LlmCompleteOptions): Promise<LlmResult> {
    this.calls++;
    this.lastOpts = opts;
    if (this.out instanceof Error) throw this.out;
    return { text: this.out, usage: STUB_USAGE };
  }
  // eslint-disable-next-line require-yield
  async *stream(): AsyncIterable<never> {
    throw new Error("not used");
  }
}
const allow: RateLimiterPort = { check: async () => true };
const deny: RateLimiterPort = { check: async () => false };

const artisan = (over: Partial<ArtisanInfo> = {}): ArtisanInfo => ({ id: 1, nomEntreprise: "Plomberie X", email: null, metier: "plomberie", ...over });

const GOOD = '{"conseils":[{"icone":"💡","titre":"Relancer","message":"3 devis en attente.","actionLabel":"Voir","actionLien":"/devis"},{"icone":"📩","titre":"Impayés","message":"Relance.","actionLabel":"Voir","actionLien":"/factures"},{"icone":"📦","titre":"Stock","message":"Réappro.","actionLabel":"Voir","actionLien":"/stocks"},{"icone":"➕","titre":"Quatrième","message":"ignoré","actionLabel":"x","actionLien":"/devis"}]}';

function build(opts: { artisan?: ArtisanInfo | null; llm?: LlmPort; rl?: RateLimiterPort; stats?: FakeConseilsStatsReader }) {
  const statsReader = opts.stats ?? new FakeConseilsStatsReader();
  return {
    statsReader,
    deps: {
      llm: opts.llm ?? new StubLlm(GOOD),
      rateLimiter: opts.rl ?? allow,
      artisanReader: new FakeArtisanReader(opts.artisan === undefined ? artisan() : opts.artisan),
      statsReader,
      maintenant: () => new Date("2026-06-15T12:00:00Z"),
    },
  };
}

describe("getConseilsIA", () => {
  it("succès : ≤3 conseils parsés + genereLe ; système = contexte métier", async () => {
    const llm = new StubLlm(GOOD);
    const { deps } = build({ llm });
    const out = await getConseilsIA(deps, ctx(1));
    expect(out.conseils).toHaveLength(3); // 4ème tronqué
    expect(out.conseils[0]).toMatchObject({ titre: "Relancer", actionLien: "/devis" });
    expect(out.genereLe).toBeTruthy();
    expect(typeof llm.lastOpts?.system).toBe("string");
  });

  it("pas d'artisan → {conseils:[]} sans appeler l'IA", async () => {
    const llm = new StubLlm(GOOD);
    const { deps } = build({ artisan: null, llm });
    expect(await getConseilsIA(deps, ctx(1))).toEqual({ conseils: [] });
    expect(llm.calls).toBe(0);
  });

  it("rate-limit atteint → {conseils:[]} sans appeler l'IA", async () => {
    const llm = new StubLlm(GOOD);
    const { deps } = build({ rl: deny, llm });
    expect(await getConseilsIA(deps, ctx(1))).toEqual({ conseils: [] });
    expect(llm.calls).toBe(0);
  });

  it("erreur provider → {conseils:[]} (dégradation silencieuse)", async () => {
    const { deps } = build({ llm: new StubLlm(new Error("boom")) });
    expect(await getConseilsIA(deps, ctx(1))).toEqual({ conseils: [] });
  });

  it("JSON non parsable → {conseils:[]}", async () => {
    const { deps } = build({ llm: new StubLlm("désolé, pas de JSON ici") });
    expect(await getConseilsIA(deps, ctx(1))).toEqual({ conseils: [] });
  });

  it("stats indisponibles → conseils quand même (prompt avec zéros)", async () => {
    const stats = new FakeConseilsStatsReader();
    stats.throwOnGet = true;
    const { deps } = build({ stats });
    const out = await getConseilsIA(deps, ctx(1));
    expect(out.conseils).toHaveLength(3); // l'IA répond malgré l'échec stats
  });
});
