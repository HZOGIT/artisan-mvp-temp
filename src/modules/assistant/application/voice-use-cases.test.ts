import { describe, it, expect } from "vitest";
import type { TenantContext } from "../../../shared/tenant";
import type { AiThread } from "../domain/assistant";
import { FakeAssistantThreadsRepository } from "../infra/assistant-threads-repository-fake";
import { FakeAssistantThreadWriter } from "../infra/assistant-thread-writer-fake";
import { persistVoiceTranscript } from "./voice-use-cases";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const thread = (id: number, artisanId: number): AiThread => ({
  id,
  artisanId,
  mode: "general",
  parcoursId: null,
  title: "T",
  lastMessageAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
});

function build() {
  const repo = new FakeAssistantThreadsRepository();
  const writer = new FakeAssistantThreadWriter();
  return { repo, writer, deps: { threadsRepo: repo, threadWriter: writer } };
}

describe("persistVoiceTranscript", () => {
  it("threadId manquant → bad-request", async () => {
    const { deps } = build();
    expect((await persistVoiceTranscript(deps, ctx(1), { threadId: 0, userTranscript: "x" })).kind).toBe("bad-request");
  });

  it("aucun transcript → bad-request", async () => {
    const { repo, deps } = build();
    repo.seedThread(thread(5, 1));
    expect((await persistVoiceTranscript(deps, ctx(1), { threadId: 5, userTranscript: "  ", assistantTranscript: "" })).kind).toBe("bad-request");
  });

  it("thread d'un autre tenant → not-found (anti-IDOR)", async () => {
    const { repo, deps } = build();
    repo.seedThread(thread(5, 1));
    expect((await persistVoiceTranscript(deps, ctx(2), { threadId: 5, userTranscript: "salut" })).kind).toBe("not-found");
  });

  it("succès : persiste user + assistant avec metadata source=voice", async () => {
    const { repo, writer, deps } = build();
    repo.seedThread(thread(5, 1));
    const out = await persistVoiceTranscript(deps, ctx(1), { threadId: 5, userTranscript: "bonjour", assistantTranscript: "salut !", usageMetadata: { tokens: 10 } });
    expect(out.kind).toBe("ok");
    expect(writer.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(writer.messages.every((m) => m.threadId === 5)).toBe(true);
    expect(writer.messages[0].metadata).toEqual({ source: "voice" });
  });

  it("seulement un transcript (assistant) → 1 message", async () => {
    const { repo, writer, deps } = build();
    repo.seedThread(thread(5, 1));
    await persistVoiceTranscript(deps, ctx(1), { threadId: 5, assistantTranscript: "réponse" });
    expect(writer.messages).toHaveLength(1);
    expect(writer.messages[0].role).toBe("assistant");
  });
});
