import type { TenantContext } from "../../../shared/tenant";
import type { INotificationRepository } from "./notification-repository";
import type { Notification, ListNotificationsOptions } from "../domain/notification";

/*
 * Use-cases de lecture — purs, le repository est injecté. Le scoping tenant est porté par
 * le `TenantContext` (le repo l'applique) ; la pagination est bornée côté repo.
 */

export function listNotifications(
  repo: INotificationRepository,
  ctx: TenantContext,
  options?: ListNotificationsOptions,
): Promise<Notification[]> {
  return repo.list(ctx, options);
}

export function compterNonLues(repo: INotificationRepository, ctx: TenantContext): Promise<number> {
  return repo.countUnread(ctx);
}
