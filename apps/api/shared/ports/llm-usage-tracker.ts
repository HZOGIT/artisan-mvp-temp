import { sql } from "drizzle-orm";
import type { LlmUsage } from "./llm";
import type { DbClient } from "../db/client";
import { llmUsage } from "../../../../drizzle/schema.pg";

export interface LlmTrackInput {
  readonly artisanId: number;
  readonly userId: number | null;
  readonly useCase: string;
  readonly usage: LlmUsage;
  readonly inputPayload?: string | null;
  readonly outputPayload?: string | null;
  readonly messageId?: number | null;
}

/** Fonction fire-and-forget : aucun await attendu par l'appelant. */
export type LlmUsageTracker = (row: LlmTrackInput) => void;

/** Tracker no-op : pour les tests (aucune dépendance DB). */
export const noopLlmTracker: LlmUsageTracker = () => undefined;

/** Tracker Drizzle : INSERT fire-and-forget dans llm_usage avec RLS tenant. */
export function makeLlmUsageTracker(db: DbClient): LlmUsageTracker {
  return (row) => {
    void db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant', ${String(row.artisanId)}, true)`);
      await tx.insert(llmUsage).values({
        artisanId:       row.artisanId,
        userId:          row.userId,
        useCase:         row.useCase,
        model:           row.usage.model,
        promptTokens:    row.usage.promptTokens,
        textInputTokens: row.usage.textInputTokens,
        audioInputTokens: row.usage.audioInputTokens,
        imageInputTokens: row.usage.imageInputTokens,
        videoInputTokens: row.usage.videoInputTokens,
        cachedTokens:    row.usage.cachedTokens,
        toolUseTokens:   row.usage.toolUseTokens,
        responseTokens:  row.usage.responseTokens,
        textOutputTokens: row.usage.textOutputTokens,
        audioOutputTokens: row.usage.audioOutputTokens,
        thinkingTokens:  row.usage.thinkingTokens,
        totalTokens:     row.usage.totalTokens,
        trafficType:     row.usage.trafficType,
        durationMs:      row.usage.durationMs,
        finishReason:    row.usage.finishReason,
        inputPayload:    row.inputPayload ?? null,
        outputPayload:   row.outputPayload ?? null,
        messageId:       row.messageId ?? null,
      });
    }).catch(() => undefined);
  };
}
