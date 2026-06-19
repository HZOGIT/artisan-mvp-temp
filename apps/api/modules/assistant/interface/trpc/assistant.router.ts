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
import { runAssistantAgent, type AssistantAgentDeps } from "../../application/assistant-agent-use-cases";
import { ValidationError, TooManyRequestsError } from "../../../../shared/errors";

/**
 * Schéma Zod de l'union discriminée des événements émis par la subscription `stream`.
 * Doit rester en parité avec `AssistantAgentEvent` (assistant-agent-use-cases.ts).
 */
const assistantStreamEventSchema = z.union([
  z.object({ threadId: z.number().int() }),
  z.object({ content: z.string() }),
  z.object({ toolStart: z.object({ name: z.string(), args: z.record(z.unknown()) }) }),
  z.object({ toolEnd: z.object({ name: z.string(), ok: z.boolean(), error: z.string().optional() }) }),
  z.object({ invalidate: z.array(z.string()) }),
  z.object({ navigate: z.string(), filtre: z.string().optional(), message: z.string().optional() }),
]);

/** Routeur tRPC assistant : 2 lectures + 4 générateurs IA + 1 subscription de chat en streaming agentique. */
export function createAssistantRouter(
  threadsRepo: IAssistantThreadsRepository,
  generators: AssistantGeneratorDeps,
  agentDeps: AssistantAgentDeps,
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
        }),
      )
      .output(assistantStreamEventSchema)
      .subscription(async function* ({ ctx, input }) {
        try {
          yield* runAssistantAgent(agentDeps, ctx.tenant!, input);
        } catch (e) {
          if (e instanceof ValidationError) throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
          if (e instanceof TooManyRequestsError) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: e.message });
          throw e;
        }
      }),
  });
}
