import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../../../../interface/trpc/trpc";
import type { DbClient } from "../../../../shared/db";
import { outboxEvent } from "../../../../shared/events/outbox-event";
import { withOutbox } from "../../../../shared/events/with-outbox";
import type { INotificationRepository } from "../../application/notification-repository";
import type { PushPort } from "../../../../shared/push/web-push-adapter";
import { listNotifications, compterNonLues } from "../../application/read-use-cases";
import { marquerLue, marquerToutesLues, archiver } from "../../application/write-use-cases";
import { genererRappelsFacturesEnRetard } from "../../application/derived-use-cases";

/** Bornes alignées sur le legacy : page cap anti-DoS (offset énorme), limit max 100. */
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
export function createNotificationsRouter(repo: INotificationRepository, push?: PushPort, db?: DbClient) {
  return router({
    getVapidPublicKey: publicProcedure.query(() => ({ key: push?.getPublicKey() ?? null })),

    subscribe: protectedProcedure
      .input(z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) }))
      .mutation(async ({ ctx, input }) => {
        await push?.subscribe(ctx.tenant.artisanId, input.endpoint, input.keys);
        return { success: true };
      }),

    unsubscribe: protectedProcedure
      .input(z.object({ endpoint: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await push?.unsubscribe(ctx.tenant.artisanId, input.endpoint);
        return { success: true };
      }),

    list: protectedProcedure.input(listInput).query(({ ctx, input }) => listNotifications(repo, ctx.tenant, input)),

    getUnreadCount: protectedProcedure.query(({ ctx }) => compterNonLues(repo, ctx.tenant)),

    markAsRead: protectedProcedure
      .input(idInput)
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          await marquerLue(r, ctx.tenant, input.id);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "notification.lue", entityType: "notification", entityId: input.id, payload: { notificationId: input.id } });
          return { success: true };
        });
      }),

    markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
      const count = await marquerToutesLues(repo, ctx.tenant);
      return { success: true, count };
    }),

    archive: protectedProcedure
      .input(idInput)
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          await archiver(r, ctx.tenant, input.id);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "notification.archivee", entityType: "notification", entityId: input.id, payload: { notificationId: input.id } });
          return { success: true };
        });
      }),

    /** Alias legacy : delete archive la notification (pas de suppression dure). */
    delete: protectedProcedure
      .input(idInput)
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          await archiver(r, ctx.tenant, input.id);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "notification.archivee", entityType: "notification", entityId: input.id, payload: { notificationId: input.id } });
          return { success: true };
        });
      }),

    /** Logique dérivée : génère les rappels pour les factures impayées en retard (idempotent). */
    generateOverdueReminders: protectedProcedure.mutation(async ({ ctx }) => {
      const { rappelsCreated } = await genererRappelsFacturesEnRetard(repo, ctx.tenant);
      /** warn si > 0 : indique des factures impayées en retard — KPI santé financière de l'artisan. */
      ctx.log[rappelsCreated > 0 ? "warn" : "info"](
        { event: "notifications_overdue_rappels_created", rappelsCreated },
        rappelsCreated > 0 ? `${rappelsCreated} rappel(s) de factures en retard générés` : "Aucun rappel de retard à générer",
      );
      return { success: true, rappelsCreated };
    }),
  });
}
