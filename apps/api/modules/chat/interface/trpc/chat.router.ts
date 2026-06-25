import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { ChatDeps } from "../../application/use-cases";
import {
  getConversations,
  getMessages,
  sendMessage,
  startConversation,
  getUnreadCount,
  archiveConversation,
  closeConversation,
  reopenConversation,
} from "../../application/use-cases";

const convIdInput = z.object({ conversationId: z.number().int() });

/*
 * Routeur tRPC du domaine chat (messagerie support artisan↔client). Toutes `protectedProcedure`,
 * request/response. Ownership → ForbiddenError (mappé 403) ; notification email best-effort.
 */
export function createChatRouter(deps: ChatDeps) {
  return router({
    getConversations: protectedProcedure.query(({ ctx }) => {
      if (!ctx.tenant) throw new TRPCError({ code: "UNAUTHORIZED" });
      return getConversations(deps, ctx.tenant);
    }),
    getMessages: protectedProcedure.input(convIdInput).query(({ ctx, input }) => {
      if (!ctx.tenant) throw new TRPCError({ code: "UNAUTHORIZED" });
      return getMessages(deps, ctx.tenant, input.conversationId);
    }),
    sendMessage: protectedProcedure
      .input(z.object({ conversationId: z.number().int(), contenu: z.string().min(1).max(5000) }))
      .mutation(({ ctx, input }) => {
        if (!ctx.tenant) throw new TRPCError({ code: "UNAUTHORIZED" });
        return sendMessage(deps, ctx.tenant, input);
      }),
    startConversation: protectedProcedure
      .input(z.object({ clientId: z.number().int(), sujet: z.string().max(255).optional(), premierMessage: z.string().max(5000).optional() }))
      .mutation(({ ctx, input }) => {
        if (!ctx.tenant) throw new TRPCError({ code: "UNAUTHORIZED" });
        return startConversation(deps, ctx.tenant, input);
      }),
    getUnreadCount: protectedProcedure.query(({ ctx }) => {
      if (!ctx.tenant) throw new TRPCError({ code: "UNAUTHORIZED" });
      return getUnreadCount(deps, ctx.tenant);
    }),
    archiveConversation: protectedProcedure.input(convIdInput).mutation(({ ctx, input }) => {
      if (!ctx.tenant) throw new TRPCError({ code: "UNAUTHORIZED" });
      return archiveConversation(deps, ctx.tenant, input.conversationId);
    }),
    closeConversation: protectedProcedure.input(convIdInput).mutation(({ ctx, input }) => {
      if (!ctx.tenant) throw new TRPCError({ code: "UNAUTHORIZED" });
      return closeConversation(deps, ctx.tenant, input.conversationId);
    }),
    reopenConversation: protectedProcedure.input(convIdInput).mutation(({ ctx, input }) => {
      if (!ctx.tenant) throw new TRPCError({ code: "UNAUTHORIZED" });
      return reopenConversation(deps, ctx.tenant, input.conversationId);
    }),
  });
}
