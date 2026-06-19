import { z } from "zod";
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
import { streamAssistantReply, type AssistantStreamDeps } from "../../application/stream-use-cases";
import { ValidationError, TooManyRequestsError } from "../../../../shared/errors";

/** Routeur tRPC assistant : 2 lectures + 4 générateurs IA + 1 subscription de chat en streaming. */
export function createAssistantRouter(
  threadsRepo: IAssistantThreadsRepository,
  generators: AssistantGeneratorDeps,
  streamDeps: AssistantStreamDeps,
) {
  return router({
    getThreads: protectedProcedure.query(({ ctx }) => getThreads(threadsRepo, ctx.tenant!)),
    getMessages: protectedProcedure
      .input(z.object({ threadId: z.number().int() }))
      .query(({ ctx, input }) => getMessages(threadsRepo, ctx.tenant!, input.threadId)),

    suggestRelances: protectedProcedure.query(({ ctx }) => suggestRelances(generators, ctx.tenant!)),
    generateDevis: protectedProcedure
      .input(z.object({ description: z.string().min(1) }))
      .mutation(({ ctx, input }) => generateDevis(generators, ctx.tenant!, input)),
    analyseRentabilite: protectedProcedure
      .input(z.object({ devisId: z.number().int() }))
      .query(({ ctx, input }) => analyseRentabilite(generators, ctx.tenant!, input)),
    predictionTresorerie: protectedProcedure.query(({ ctx }) => predictionTresorerie(generators, ctx.tenant!)),

    /** Chat IA en streaming SSE (remplace POST /api/assistant/stream, désormais via tRPC subscription). */
    stream: protectedProcedure
      .input(
        z.object({
          message: z.string().min(1),
          history: z.array(z.object({ role: z.string(), content: z.string() })).optional(),
          pageContext: z.string().optional(),
          threadId: z.number().int().optional(),
        }),
      )
      .subscription(async function* ({ ctx, input }) {
        try {
          yield* streamAssistantReply(streamDeps, ctx.tenant!, input);
        } catch (e) {
          if (e instanceof ValidationError) throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
          if (e instanceof TooManyRequestsError) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: e.message });
          throw e;
        }
      }),
  });
}
