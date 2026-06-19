import { z } from "zod";
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

/*
 * Routeur tRPC du domaine assistant (6 procs appelées par le client). Toutes `protectedProcedure`,
 * request/response (PAS de SSE). 2 lectures (threads/messages) + 4 générateurs IA. Transport mince :
 * délègue aux use-cases (scoping tenant via ctx.tenant), laisse remonter les Domain errors.
 */
export function createAssistantRouter(threadsRepo: IAssistantThreadsRepository, generators: AssistantGeneratorDeps) {
  return router({
    /** ── Lectures (historique conversations) ────────────────────────────────────────────────────── */
    getThreads: protectedProcedure.query(({ ctx }) => getThreads(threadsRepo, ctx.tenant!)),
    getMessages: protectedProcedure
      .input(z.object({ threadId: z.number().int() }))
      .query(({ ctx, input }) => getMessages(threadsRepo, ctx.tenant!, input.threadId)),

    /** ── Générateurs IA (request/response) ──────────────────────────────────────────────────────── */
    suggestRelances: protectedProcedure.query(({ ctx }) => suggestRelances(generators, ctx.tenant!)),
    generateDevis: protectedProcedure
      .input(z.object({ description: z.string().min(1) }))
      .mutation(({ ctx, input }) => generateDevis(generators, ctx.tenant!, input)),
    analyseRentabilite: protectedProcedure
      .input(z.object({ devisId: z.number().int() }))
      .query(({ ctx, input }) => analyseRentabilite(generators, ctx.tenant!, input)),
    predictionTresorerie: protectedProcedure.query(({ ctx }) => predictionTresorerie(generators, ctx.tenant!)),
  });
}
