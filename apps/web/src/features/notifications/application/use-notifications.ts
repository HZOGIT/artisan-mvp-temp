import { trpc } from "@/shared/trpc";
import type { Notification } from "../domain/notification";

/*
 * Couche APPLICATION de la feature `notifications` (clean-archi) : SEULE couche important tRPC.
 * Encapsule les queries (liste filtrée + compteur non-lues) et les mutations (markAsRead /
 * markAllAsRead / delete) avec invalidation, expose des données TYPÉES + des actions. L'UI attache ses
 * effets (toast / navigation) via le `onSuccess` par appel de `.mutate()`.
 */
export function useNotifications(nonLuesUniquement: boolean) {
  const utils = trpc.useUtils();
  const listQ = trpc.notifications.list.useQuery({ nonLuesUniquement, limit: 100 });
  const unreadQ = trpc.notifications.getUnreadCount.useQuery();

  const invalidate = () => {
    utils.notifications.list.invalidate();
    utils.notifications.getUnreadCount.invalidate();
  };

  const markAsRead = trpc.notifications.markAsRead.useMutation({ onSuccess: invalidate });
  const markAllAsRead = trpc.notifications.markAllAsRead.useMutation({ onSuccess: invalidate });
  const remove = trpc.notifications.delete.useMutation({ onSuccess: invalidate });

  const notifications: Notification[] = listQ.data ?? [];
  const unreadCount: number = unreadQ.data ?? 0;

  return { notifications, unreadCount, markAsRead, markAllAsRead, remove };
}
