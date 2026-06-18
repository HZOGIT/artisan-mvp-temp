import type { TenantContext } from "../../../shared/tenant";
import type { AssistantThreadWriter } from "../application/assistant-thread-writer";

// Writer threads/messages assistant fake (in-memory) pour les tests des use-cases.
export class FakeAssistantThreadWriter implements AssistantThreadWriter {
  public threads: Array<{ artisanId: number; firstMessage: string; id: number }> = [];
  public messages: Array<{ artisanId: number; threadId: number; role: string; transcript: string; metadata?: unknown }> = [];
  public failCreate = false;
  private seq = 100;

  async createThread(ctx: TenantContext, firstMessage: string): Promise<number> {
    if (this.failCreate) throw new Error("create failed");
    const id = ++this.seq;
    this.threads.push({ artisanId: ctx.artisanId, firstMessage, id });
    return id;
  }
  async addMessage(ctx: TenantContext, threadId: number, role: "user" | "assistant", transcript: string, metadata?: unknown): Promise<void> {
    this.messages.push({ artisanId: ctx.artisanId, threadId, role, transcript, metadata });
  }
}
