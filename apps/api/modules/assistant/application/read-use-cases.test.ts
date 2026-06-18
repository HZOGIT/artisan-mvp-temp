import { describe, it, expect } from "vitest";
import type { TenantContext } from "../../../shared/tenant";
import type { AiThread, AiMessage } from "../domain/assistant";
import { FakeAssistantThreadsRepository } from "../infra/assistant-threads-repository-fake";
import { getThreads, getMessages } from "./read-use-cases";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

const thread = (over: Partial<AiThread>): AiThread => ({
  id: 1,
  artisanId: 1,
  mode: "general",
  parcoursId: null,
  title: "T",
  lastMessageAt: new Date("2026-06-15T10:00:00Z"),
  createdAt: new Date("2026-06-15T09:00:00Z"),
  updatedAt: new Date("2026-06-15T10:00:00Z"),
  ...over,
});

const message = (over: Partial<AiMessage>): AiMessage => ({
  id: 1,
  threadId: 1,
  role: "user",
  transcript: "salut",
  attachments: null,
  metadata: null,
  pricingMetadata: null,
  createdAt: new Date("2026-06-15T10:00:00Z"),
  ...over,
});

describe("assistant read use-cases", () => {
  it("getThreads : threads du tenant, triés lastMessageAt desc", async () => {
    const repo = new FakeAssistantThreadsRepository();
    repo.seedThread(thread({ id: 1, artisanId: 1, lastMessageAt: new Date("2026-06-15T08:00:00Z") }));
    repo.seedThread(thread({ id: 2, artisanId: 1, lastMessageAt: new Date("2026-06-15T12:00:00Z") }));
    repo.seedThread(thread({ id: 3, artisanId: 2 })); // autre tenant
    const out = await getThreads(repo, ctx(1));
    expect(out.map((t) => t.id)).toEqual([2, 1]);
  });

  it("getThreads : un autre tenant ne voit pas les threads", async () => {
    const repo = new FakeAssistantThreadsRepository();
    repo.seedThread(thread({ id: 1, artisanId: 1 }));
    expect(await getThreads(repo, ctx(2))).toEqual([]);
  });

  it("getMessages : messages d'un thread possédé, triés createdAt asc", async () => {
    const repo = new FakeAssistantThreadsRepository();
    repo.seedThread(thread({ id: 5, artisanId: 1 }));
    repo.seedMessage(message({ id: 2, threadId: 5, createdAt: new Date("2026-06-15T10:05:00Z") }));
    repo.seedMessage(message({ id: 1, threadId: 5, createdAt: new Date("2026-06-15T10:00:00Z") }));
    const out = await getMessages(repo, ctx(1), 5);
    expect(out.map((m) => m.id)).toEqual([1, 2]);
  });

  it("getMessages : thread d'un autre tenant → [] (anti-IDOR via le thread parent)", async () => {
    const repo = new FakeAssistantThreadsRepository();
    repo.seedThread(thread({ id: 5, artisanId: 1 }));
    repo.seedMessage(message({ id: 1, threadId: 5 }));
    expect(await getMessages(repo, ctx(2), 5)).toEqual([]);
  });

  it("getMessages : thread inexistant → []", async () => {
    const repo = new FakeAssistantThreadsRepository();
    expect(await getMessages(repo, ctx(1), 999)).toEqual([]);
  });
});
