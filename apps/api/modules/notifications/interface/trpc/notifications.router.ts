import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { INotificationRepository } from "../../application/notification-repository";
import { listNotifications, compterNonLues } from "../../application/read-use-cases";
import { marquerLue, marquerToutesLues, archiver } from "../../application/write-use-cases";
import { genererRappelsFacturesEnRetard } from "../../application/derived-use-cases";

// Bornes alignées sur le legacy : page cap anti-DoS (offset énorme), limit max 100.
const listInput = z
  .object({
    includeArchived: z.boolean().default(false),
    nonLuesUniquement: z.boolean().default(false),
    page: z.number().int().min(1).max(100000).default(1),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .optional();

const idInput = z.object({ id: z.number().int() });

/*
 * Routeur tRPC du domaine notifications. Transport mince : valide les inputs (zod), délègue
 * aux use-cases (scoping tenant via ctx.tenant), laisse remonter les Domain errors
 * (NotFound→404). Repository injecté (DI) → testable. `delete` = alias d'`archive` (legacy).
 */
export function createNotificationsRouter(repo: INotificationRepository) {
  return router({
    list: protectedProcedure.input(listInput).query(({ ctx, input }) => listNotifications(repo, ctx.tenant, input)),

    getUnreadCount: protectedProcedure.query(({ ctx }) => compterNonLues(repo, ctx.tenant)),

    markAsRead: protectedProcedure
      .input(idInput)
      .mutation(async ({ ctx, input }) => {
        await marquerLue(repo, ctx.tenant, input.id);
        return { success: true };
      }),

    markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
      const count = await marquerToutesLues(repo, ctx.tenant);
      return { success: true, count };
    }),

    archive: protectedProcedure
      .input(idInput)
      .mutation(async ({ ctx, input }) => {
        await archiver(repo, ctx.tenant, input.id);
        return { success: true };
      }),

    // Alias legacy : delete archive la notification (pas de suppression dure).
    delete: protectedProcedure
      .input(idInput)
      .mutation(async ({ ctx, input }) => {
        await archiver(repo, ctx.tenant, input.id);
        return { success: true };
      }),

    // Logique dérivée : génère les rappels pour les factures impayées en retard (idempotent).
    generateOverdueReminders: protectedProcedure.mutation(async ({ ctx }) => {
      const { rappelsCreated } = await genererRappelsFacturesEnRetard(repo, ctx.tenant);
      return { success: true, rappelsCreated };
    }),
  });
}
