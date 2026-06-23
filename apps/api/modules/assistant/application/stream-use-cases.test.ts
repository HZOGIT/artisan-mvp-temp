import { describe, it, expect } from "vitest";
import { TooManyRequestsError, ValidationError } from "../../../shared/errors";
import type { LlmPort, LlmCompleteOptions, LlmResult, LlmStreamChunk } from "../../../shared/ports/llm";
import type { RateLimiterPort } from "../../../shared/ports/rate-limiter";
import type { ArtisanReader, ArtisanInfo } from "../../../shared/readers/contact-readers";
import type { TenantContext } from "../../../shared/tenant";
import type { ConseilsStatsReader } from "../../conseils-ia/application/conseils-stats-reader";
import { FakeAssistantThreadWriter } from "../infra/assistant-thread-writer-fake";
import { streamAssistantReply, type AssistantStreamEvent } from "./stream-use-cases";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

const STUB_USAGE: LlmResult["usage"] = {
  model: "stub", durationMs: 0, finishReason: "STOP",
  promptTokens: 0, responseTokens: 0, thinkingTokens: 0, cachedTokens: 0, toolUseTokens: 0, totalTokens: 0,
  textInputTokens: 0, audioInputTokens: 0, imageInputTokens: 0, videoInputTokens: 0,
  textOutputTokens: 0, audioOutputTokens: 0, trafficType: null,
};

class StreamLlm implements LlmPort {
  public lastPrompt?: string;
  public lastSystem?: string;
  constructor(private readonly chunks: string[]) {}
  async complete(): Promise<LlmResult> {
    return { text: this.chunks.join(""), usage: STUB_USAGE };
  }
  async *stream(prompt: string, opts?: LlmCompleteOptions): AsyncIterable<LlmStreamChunk> {
    this.lastPrompt = prompt;
    this.lastSystem = opts?.system;
    for (const c of this.chunks) yield { kind: "text", text: c };
    yield { kind: "done", usage: STUB_USAGE };
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
const stats: ConseilsStatsReader = { getStats: async () => ({ nbDevisEnAttente: 3, nbFacturesImpayees: 2, montantImpayees: 1500, nbStocksBas: 0 }) };
const artisan: ArtisanInfo = { id: 1, nomEntreprise: "Plomberie X", email: null, metier: "plomberie" };

function build(over: { llm?: LlmPort; rl?: RateLimiterPort; writer?: FakeAssistantThreadWriter } = {}) {
  const writer = over.writer ?? new FakeAssistantThreadWriter();
  return {
    writer,
    deps: {
      llm: over.llm ?? new StreamLlm(["Bonjour", " ", "artisan"]),
      rateLimiter: over.rl ?? allow,
      artisanReader: new FakeArtisan(artisan),
      statsReader: stats,
      threadWriter: writer,
    },
  };
}

async function collect(gen: AsyncGenerator<AssistantStreamEvent>): Promise<AssistantStreamEvent[]> {
  const out: AssistantStreamEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

describe("streamAssistantReply", () => {
  it("message vide → ValidationError (400)", async () => {
    const { deps } = build();
    await expect(collect(streamAssistantReply(deps, ctx(1), { message: "  " }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("rate-limit atteint → TooManyRequestsError (429)", async () => {
    const { deps } = build({ rl: deny });
    await expect(collect(streamAssistantReply(deps, ctx(1), { message: "salut" }))).rejects.toBeInstanceOf(TooManyRequestsError);
  });

  it("succès : émet {threadId} puis les {content} ; système = prompt métier + stats", async () => {
    const llm = new StreamLlm(["Bon", "jour"]);
    const { deps, writer } = build({ llm });
    const events = await collect(streamAssistantReply(deps, ctx(1), { message: "Aide-moi" }));
    expect(events[0]).toHaveProperty("threadId");
    expect(events.slice(1)).toEqual([{ content: "Bon" }, { content: "jour" }]);
    expect(llm.lastSystem).toContain("MonAssistant");
    expect(llm.lastSystem).toContain("3 devis en attente");
    // persistance : user + assistant
    expect(writer.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(writer.messages[1].transcript).toBe("Bonjour");
  });

  it("réutilise le threadId fourni (pas de nouveau thread créé)", async () => {
    const { deps, writer } = build();
    const events = await collect(streamAssistantReply(deps, ctx(1), { message: "salut", threadId: 77 }));
    expect(events[0]).toEqual({ threadId: 77 });
    expect(writer.threads).toHaveLength(0); // aucun thread créé
    expect(writer.messages.every((m) => m.threadId === 77)).toBe(true);
  });

  it("création de thread KO → continue le stream sans threadId (best-effort)", async () => {
    const writer = new FakeAssistantThreadWriter();
    writer.failCreate = true;
    const { deps } = build({ writer });
    const events = await collect(streamAssistantReply(deps, ctx(1), { message: "salut" }));
    expect(events.some((e) => "threadId" in e)).toBe(false);
    expect(events.some((e) => "content" in e)).toBe(true);
  });

  it("historique injecté dans le prompt utilisateur", async () => {
    const llm = new StreamLlm(["ok"]);
    const { deps } = build({ llm });
    await collect(streamAssistantReply(deps, ctx(1), { message: "et après ?", history: [{ role: "user", content: "salut" }, { role: "assistant", content: "bonjour" }] }));
    expect(llm.lastPrompt).toContain("Historique de la conversation");
    expect(llm.lastPrompt).toContain("et après ?");
  });
});
