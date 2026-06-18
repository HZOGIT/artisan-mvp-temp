import type { TenantContext } from "../../../shared/tenant";
import type { AiThread, AiMessage } from "../domain/assistant";
import type { IAssistantThreadsRepository } from "../application/assistant-threads-repository";

// Repo threads/messages assistant in-memory pour les tests (scoping tenant reproduit).
export class FakeAssistantThreadsRepository implements IAssistantThreadsRepository {
  private threads: AiThread[] = [];
  private messages: AiMessage[] = [];

  seedThread(t: AiThread): void {
    this.threads.push(t);
  }
  seedMessage(m: AiMessage): void {
    this.messages.push(m);
  }

  async listThreads(ctx: TenantContext, limit: number): Promise<AiThread[]> {
    return this.threads
      .filter((t) => t.artisanId === ctx.artisanId)
      .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime())
      .slice(0, limit);
  }

  async getThreadOwned(ctx: TenantContext, threadId: number): Promise<AiThread | null> {
    return this.threads.find((t) => t.id === threadId && t.artisanId === ctx.artisanId) ?? null;
  }

  async listMessages(_ctx: TenantContext, threadId: number, limit: number): Promise<AiMessage[]> {
    return this.messages
      .filter((m) => m.threadId === threadId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, limit);
  }
}
