import { and, eq } from "drizzle-orm";
import { aiThreads, aiMessages } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { AssistantThreadWriter } from "../application/assistant-thread-writer";

// Titre du thread = 80 premiers caractères du 1er message (parité legacy `getOrCreateAiThread`).
function threadTitle(firstMessage: string): string {
  return firstMessage.slice(0, 80) + (firstMessage.length > 80 ? "…" : "");
}

/*
 * Écriture threads/messages assistant sous RLS (withTenant) + filtre artisanId. `ai_messages` (sans
 * artisanId) est scopé via le thread parent (l'ownership est vérifiée à l'ajout via l'update du thread).
 */
export class AssistantThreadWriterDrizzle implements AssistantThreadWriter {
  constructor(private readonly db: DbClient) {}

  createThread(ctx: TenantContext, firstMessage: string): Promise<number> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(aiThreads)
        .values({ artisanId: ctx.artisanId, mode: "general", title: threadTitle(firstMessage), lastMessageAt: new Date() })
        .returning({ id: aiThreads.id });
      return row.id;
    });
  }

  addMessage(ctx: TenantContext, threadId: number, role: "user" | "assistant", transcript: string, metadata?: unknown, pricingMetadata?: unknown): Promise<void> {
    return withTenant(this.db, ctx, async (tx) => {
      await tx.insert(aiMessages).values({ threadId, role, transcript, metadata: metadata ?? null, pricingMetadata: pricingMetadata ?? null });
      await tx.update(aiThreads).set({ lastMessageAt: new Date() }).where(and(eq(aiThreads.id, threadId), eq(aiThreads.artisanId, ctx.artisanId)));
    });
  }
}
