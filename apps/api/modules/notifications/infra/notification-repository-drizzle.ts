import { and, desc, eq, inArray, lt, isNotNull, sql } from "drizzle-orm";
import { notifications, factures, clients } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { INotificationRepository } from "../application/notification-repository";
import type { Notification, ListNotificationsOptions } from "../domain/notification";
import type { FactureEnRetard, CreerNotificationInput } from "../domain/facture-en-retard";

type NotificationRow = typeof notifications.$inferSelect;

const LIMIT_MAX = 100;
/** cap anti-DoS sur l'offset (≈ 5M lignes max) */
const PAGE_MAX = 100000;

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

/*
 * Implémentation Drizzle du repository notifications. Double cloisonnement : RLS (rôle app
 * + app.tenant via withTenant) ET filtre explicite `artisanId`. Filtres + pagination
 * poussés en SQL ; bornes anti-DoS (limit≤100, page≤100000).
 */
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

  listFacturesEnRetard(ctx: TenantContext): Promise<FactureEnRetard[]> {
    return withTenant(this.db, ctx, async (tx) => {
      /** Lecture seule, scopée tenant : factures non payées/non annulées à échéance dépassée. */
      const today = new Date().toISOString().slice(0, 10);
      const rows = await tx
        .select({
          id: factures.id,
          numero: factures.numero,
          totalTTC: factures.totalTTC,
          dateEcheance: factures.dateEcheance,
          nom: clients.nom,
          prenom: clients.prenom,
        })
        .from(factures)
        .leftJoin(clients, and(eq(clients.id, factures.clientId), eq(clients.artisanId, ctx.artisanId)))
        .where(
          and(
            eq(factures.artisanId, ctx.artisanId),
            inArray(factures.statut, ["envoyee", "en_retard"]),
            isNotNull(factures.dateEcheance),
            lt(sql`${factures.dateEcheance}::date`, today),
          ),
        )
        .orderBy(desc(factures.dateEcheance));
      return rows
        .filter((r): r is typeof r & { dateEcheance: Date } => r.dateEcheance != null)
        .map((r) => ({
          id: r.id,
          numero: r.numero,
          totalTTC: r.totalTTC ?? "0.00",
          dateEcheance: r.dateEcheance,
          clientNom: [r.prenom, r.nom].filter(Boolean).join(" ").trim() || null,
        }));
    });
  }

  existeNotificationActive(ctx: TenantContext, lien: string): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(notifications)
        .where(
          and(eq(notifications.artisanId, ctx.artisanId), eq(notifications.lien, lien), eq(notifications.archived, false)),
        );
      return Number(row?.n ?? 0) > 0;
    });
  }

  creer(ctx: TenantContext, input: CreerNotificationInput): Promise<Notification> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(notifications)
        .values({ artisanId: ctx.artisanId, type: input.type, titre: input.titre, message: input.message, lien: input.lien })
        .returning();
      return toNotification(row);
    });
  }

  withDb(db: DbClient): NotificationRepositoryDrizzle {
    return new NotificationRepositoryDrizzle(db);
  }
}
