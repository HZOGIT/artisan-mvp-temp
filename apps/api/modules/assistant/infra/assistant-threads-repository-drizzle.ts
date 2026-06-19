import { and, asc, desc, eq } from "drizzle-orm";
import { aiThreads, aiMessages } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { AiThread, AiMessage } from "../domain/assistant";
import type { IAssistantThreadsRepository } from "../application/assistant-threads-repository";

function toThread(r: typeof aiThreads.$inferSelect): AiThread {
  return {
    id: r.id,
    artisanId: r.artisanId,
    mode: r.mode ?? "general",
    parcoursId: r.parcoursId ?? null,
    title: r.title,
    lastMessageAt: r.lastMessageAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function toMessage(r: typeof aiMessages.$inferSelect): AiMessage {
  return {
    id: r.id,
    threadId: r.threadId,
    role: r.role,
    transcript: r.transcript,
    attachments: r.attachments ?? null,
    metadata: r.metadata ?? null,
    pricingMetadata: r.pricingMetadata ?? null,
    createdAt: r.createdAt,
  };
}

/*
 * Lecture threads/messages assistant sous RLS (withTenant) + filtre artisanId explicite. `ai_messages`
 * (sans artisanId) n'est lu qu'après vérif d'appartenance du thread parent (anti-IDOR cross-tenant).
 */
export class AssistantThreadsRepositoryDrizzle implements IAssistantThreadsRepository {
  constructor(private readonly db: DbClient) {}

  listThreads(ctx: TenantContext, limit: number): Promise<AiThread[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(aiThreads)
        .where(eq(aiThreads.artisanId, ctx.artisanId))
        .orderBy(desc(aiThreads.lastMessageAt))
        .limit(limit);
      return rows.map(toThread);
    });
  }

  getThreadOwned(ctx: TenantContext, threadId: number): Promise<AiThread | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [r] = await tx
        .select()
        .from(aiThreads)
        .where(and(eq(aiThreads.id, threadId), eq(aiThreads.artisanId, ctx.artisanId)))
        .limit(1);
      return r ? toThread(r) : null;
    });
  }

  listMessages(ctx: TenantContext, threadId: number, limit: number): Promise<AiMessage[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(aiMessages)
        .where(eq(aiMessages.threadId, threadId))
        .orderBy(asc(aiMessages.createdAt))
        .limit(limit);
      return rows.map(toMessage);
    });
  }
}
