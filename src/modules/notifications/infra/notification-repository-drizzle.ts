import { and, desc, eq, sql } from "drizzle-orm";
import { notifications } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { INotificationRepository } from "../application/notification-repository";
import type { Notification, ListNotificationsOptions } from "../domain/notification";

type NotificationRow = typeof notifications.$inferSelect;

const LIMIT_MAX = 100;
const PAGE_MAX = 100000; // cap anti-DoS sur l'offset (≈ 5M lignes max)

function toNotification(r: NotificationRow): Notification {
  return {
    id: r.id,
    artisanId: r.artisanId,
    type: (r.type ?? "info") as Notification["type"],
    titre: r.titre,
    message: r.message ?? null,
    lien: r.lien ?? null,
    lu: r.lu ?? false,
    archived: r.archived ?? false,
    createdAt: r.createdAt,
  };
}

// Implémentation Drizzle du repository notifications. Double cloisonnement : RLS (rôle app
// + app.tenant via withTenant) ET filtre explicite `artisanId`. Filtres + pagination
// poussés en SQL ; bornes anti-DoS (limit≤100, page≤100000).
export class NotificationRepositoryDrizzle implements INotificationRepository {
  constructor(private readonly db: DbClient) {}

  list(ctx: TenantContext, options?: ListNotificationsOptions): Promise<Notification[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const limit = Math.min(Math.max(options?.limit ?? 50, 1), LIMIT_MAX);
      const page = Math.min(Math.max(options?.page ?? 1, 1), PAGE_MAX);
      const offset = (page - 1) * limit;

      const conds = [eq(notifications.artisanId, ctx.artisanId)];
      if (!options?.includeArchived) conds.push(eq(notifications.archived, false));
      if (options?.nonLuesUniquement) conds.push(eq(notifications.lu, false));

      const rows = await tx
        .select()
        .from(notifications)
        .where(and(...conds))
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(limit)
        .offset(offset);
      return rows.map(toNotification);
    });
  }

  countUnread(ctx: TenantContext): Promise<number> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(eq(notifications.artisanId, ctx.artisanId), eq(notifications.lu, false), eq(notifications.archived, false)));
      return Number(row?.n ?? 0);
    });
  }

  markAsRead(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const updated = await tx
        .update(notifications)
        .set({ lu: true })
        .where(and(eq(notifications.id, id), eq(notifications.artisanId, ctx.artisanId)))
        .returning({ id: notifications.id });
      return updated.length > 0;
    });
  }

  markAllAsRead(ctx: TenantContext): Promise<number> {
    return withTenant(this.db, ctx, async (tx) => {
      const updated = await tx
        .update(notifications)
        .set({ lu: true })
        .where(and(eq(notifications.artisanId, ctx.artisanId), eq(notifications.lu, false)))
        .returning({ id: notifications.id });
      return updated.length;
    });
  }

  archive(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const updated = await tx
        .update(notifications)
        .set({ archived: true })
        .where(and(eq(notifications.id, id), eq(notifications.artisanId, ctx.artisanId)))
        .returning({ id: notifications.id });
      return updated.length > 0;
    });
  }
}
