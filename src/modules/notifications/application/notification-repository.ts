import type { TenantContext } from "../../../shared/tenant";
import type { Notification, ListNotificationsOptions } from "../domain/notification";

// Port du repository notifications. Chaque méthode exige le TenantContext (scope tenant +
// RLS). `notifications` possède un `artisanId` → double cloisonnement RLS + filtre.
// Invariant anti-IDOR : marquer-lu / archiver une notification d'un autre artisan échoue
// (false), jamais d'effet cross-tenant.
export interface INotificationRepository {
  list(ctx: TenantContext, options?: ListNotificationsOptions): Promise<Notification[]>;
  countUnread(ctx: TenantContext): Promise<number>;
  // Marque une notification comme lue — false si elle n'appartient pas au tenant.
  markAsRead(ctx: TenantContext, id: number): Promise<boolean>;
  // Marque toutes les notifications du tenant comme lues — renvoie le nombre affecté.
  markAllAsRead(ctx: TenantContext): Promise<number>;
  // Archive une notification — false si elle n'appartient pas au tenant.
  archive(ctx: TenantContext, id: number): Promise<boolean>;
}
