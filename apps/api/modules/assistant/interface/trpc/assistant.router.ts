import { z } from "zod";
import { randomUUID } from "crypto";
import { inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IAssistantThreadsRepository } from "../../application/assistant-threads-repository";
import { getThreads, getMessages } from "../../application/read-use-cases";
import type { AssistantGeneratorDeps } from "../../application/generator-use-cases";
import {
  suggestRelances,
  generateDevis,
  analyseRentabilite,
  predictionTresorerie,
} from "../../application/generator-use-cases";
import { runAssistantAgent, type AssistantAgentDeps } from "../../application/assistant-agent-use-cases";
import { ValidationError, TooManyRequestsError } from "../../../../shared/errors";
import type { StoragePort } from "../../../../shared/ports/storage";
import type { DbClient } from "../../../../shared/db";
import { withTenant } from "../../../../shared/db";
import { files } from "../../../../../../drizzle/schema/files";
import { messageFiles } from "../../../../../../drizzle/schema/message-files";

/**
 * Schéma Zod de l'union discriminée des événements émis par la subscription `stream`.
 * Doit rester en parité avec `AssistantAgentEvent` (assistant-agent-use-cases.ts).
 * Utilisé pour la validation runtime de chaque événement avant envoi au client.
 */
export const assistantStreamEventSchema = z.union([
  z.object({ threadId: z.number().int() }),
  z.object({ content: z.string() }),
  z.object({ toolStart: z.object({ name: z.string(), args: z.record(z.string(), z.unknown()) }) }),
  z.object({ toolEnd: z.object({ name: z.string(), ok: z.boolean(), error: z.string().optional() }) }),
  z.object({ invalidate: z.array(z.string()) }),
  z.object({ navigate: z.string(), filtre: z.string().optional(), message: z.string().optional() }),
]);

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "image/heic": "heic", "image/gif": "gif", "application/pdf": "pdf",
  "text/plain": "txt", "text/csv": "csv",
};
const ALLOWED_MIMES = new Set(Object.keys(MIME_TO_EXT));

/** Routeur tRPC assistant : lectures + générateurs IA + upload + subscription de chat en streaming agentique. */
export function createAssistantRouter(
  threadsRepo: IAssistantThreadsRepository,
  generators: AssistantGeneratorDeps,
  agentDeps: AssistantAgentDeps,
  storage: StoragePort,
  db: DbClient,
) {
  return router({
    getThreads: protectedProcedure.query(({ ctx }) => {
      if (!ctx.tenant) throw new TRPCError({ code: "UNAUTHORIZED" });
      return getThreads(threadsRepo, ctx.tenant);
    }),
    getMessages: protectedProcedure
      .input(z.object({ threadId: z.number().int() }))
      .query(({ ctx, input }) => {
        if (!ctx.tenant) throw new TRPCError({ code: "UNAUTHORIZED" });
        return getMessages(threadsRepo, ctx.tenant, input.threadId);
      }),

    suggestRelances: protectedProcedure.query(({ ctx }) => {
      if (!ctx.tenant) throw new TRPCError({ code: "UNAUTHORIZED" });
      return suggestRelances(generators, ctx.tenant);
    }),
    generateDevis: protectedProcedure
      .input(z.object({ description: z.string().min(1) }))
      .mutation(({ ctx, input }) => {
        if (!ctx.tenant) throw new TRPCError({ code: "UNAUTHORIZED" });
        return generateDevis(generators, ctx.tenant, input);
      }),
    analyseRentabilite: protectedProcedure
      .input(z.object({ devisId: z.number().int() }))
      .query(({ ctx, input }) => {
        if (!ctx.tenant) throw new TRPCError({ code: "UNAUTHORIZED" });
        return analyseRentabilite(generators, ctx.tenant, input);
      }),
    predictionTresorerie: protectedProcedure.query(({ ctx }) => {
      if (!ctx.tenant) throw new TRPCError({ code: "UNAUTHORIZED" });
      return predictionTresorerie(generators, ctx.tenant);
    }),

    uploadFile: protectedProcedure
      .input(z.object({
        base64: z.string().min(1),
        mimeType: z.string().min(1),
        filename: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.tenant) throw new TRPCError({ code: "UNAUTHORIZED" });
        const raw = input.base64.replace(/^data:[^,]+,/, "");
        const buf = Buffer.from(raw, "base64");
        if (buf.byteLength > 20 * 1024 * 1024) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Fichier trop volumineux (max 20 Mo)" });
        if (!ALLOWED_MIMES.has(input.mimeType)) throw new TRPCError({ code: "BAD_REQUEST", message: `Type de fichier non supporté : ${input.mimeType}` });
        const ext = MIME_TO_EXT[input.mimeType]!;
        const key = `chat/${ctx.tenant.artisanId}/${randomUUID()}.${ext}`;
        const stored = await storage.upload(key, buf, {
          contentType: input.mimeType,
          artisanId: ctx.tenant.artisanId,
          filename: input.filename,
          purpose: "assistant-chat",
        }, ctx.tenant);
        return { fileId: stored.id };
      }),

    /**
     * Chat IA en streaming agentique (function-calling, outils navigate/invalide/écriture).
     * Remplace l'ancien text-mode ; émet threadId, content, toolStart, toolEnd, navigate, invalidate.
     */
    stream: protectedProcedure
      .input(
        z.object({
          message: z.string().min(1),
          history: z.array(z.object({ role: z.string(), content: z.string() })).optional(),
          pageContext: z.string().optional(),
          threadId: z.number().int().optional(),
          fileIds: z.array(z.number().int()).max(5).optional(),
        }),
      )
      .subscription(async function* ({ ctx, input }) {
        if (!ctx.tenant) throw new TRPCError({ code: "UNAUTHORIZED" });
        const tenant = ctx.tenant;
        const t0 = Date.now();
        let contentEvents = 0;
        let toolCalls = 0;
        try {
          const canWrite = ctx.role === "admin" || ctx.tenant?.isOwner === true;
          const canDevis = canWrite || ctx.permissions.includes("devis.gerer");
          const canFactures = canWrite || ctx.permissions.includes("factures.gerer");

          let attachments: Array<{ data: Buffer; mimeType: string }> | undefined;
          if (input.fileIds?.length) {
            const rows = await withTenant(db, tenant, (tx) =>
              tx.select({ storageKey: files.storageKey, mimeType: files.mimeType })
                .from(files)
                .where(inArray(files.id, input.fileIds!)),
            );
            const fetched = await Promise.all(
              rows.map(async (r) => {
                const data = await storage.get(r.storageKey);
                return data ? { data, mimeType: r.mimeType } : null;
              }),
            );
            attachments = fetched.filter((x): x is { data: Buffer; mimeType: string } => x !== null);
          }

          let resolvedThreadId = input.threadId;
          for await (const ev of runAssistantAgent(agentDeps, tenant, { ...input, userCanWriteDevis: canDevis, userCanWriteFactures: canFactures, attachments })) {
            const validated = assistantStreamEventSchema.parse(ev);
            if ("threadId" in validated) {
              resolvedThreadId = validated.threadId;
              const tid = resolvedThreadId;
              if (input.fileIds?.length && tid) {
                await withTenant(db, tenant, (tx) =>
                  tx.insert(messageFiles).values(
                    input.fileIds!.map((fileId) => ({
                      conversationId: tid.toString(),
                      messageIndex: 0,
                      fileId,
                      artisanId: tenant.artisanId,
                    })),
                  ).onConflictDoNothing(),
                ).catch(() => { /* best-effort */ });
              }
            }
            if ("content" in validated) contentEvents++;
            if ("toolStart" in validated) toolCalls++;
            yield validated;
          }
          ctx.log.info({ event: "assistant_stream_completed", durationMs: Date.now() - t0, contentEvents, toolCalls, threadId: input.threadId ?? null }, "Chat IA terminé");
        } catch (e) {
          const err = e instanceof Error ? e : new Error(String(e));
          ctx.log.error({ event: "assistant_stream_error", err, durationMs: Date.now() - t0 }, "Erreur chat IA agentique");
          if (e instanceof ValidationError) throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
          if (e instanceof TooManyRequestsError) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: e.message });
          throw e;
        }
      }),
  });
}
