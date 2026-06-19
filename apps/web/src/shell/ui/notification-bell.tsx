import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "@/shared/router/navigation";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { trpc } from "@/shared/trpc";
import type { RouterOutputs } from "@/shared/trpc";
import { formatRelativeDate } from "../domain/nav";
import { notifTypeMeta } from "../domain/notif-style";

type Notif = RouterOutputs["notifications"]["list"][number];

/*
 * Cloche de notifications de la top bar du SHELL modern. PORT FIDÈLE de DashboardLayout (compteur non-lus +
 * popover liste + marquer lu/tout lu + lien). Self-contained (tRPC modern + wouter pour la nav).
 */
export function NotificationBell() {
  const { t } = useTranslation("shell");
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const { data: unreadCount = 0 } = trpc.notifications.getUnreadCount.useQuery(undefined, { refetchInterval: 30000 });
  const { data: notifications = [], refetch } = trpc.notifications.list.useQuery({ limit: 10 }, { enabled: open });
  const markAsRead = trpc.notifications.markAsRead.useMutation({ onSuccess: () => refetch() });
  const markAllAsRead = trpc.notifications.markAllAsRead.useMutation({ onSuccess: () => refetch() });

  const handleClick = (notif: Notif) => {
    if (!notif.lu) markAsRead.mutate({ id: notif.id });
    if (notif.lien) { setOpen(false); setLocation(notif.lien); }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative h-9 w-9 flex items-center justify-center rounded-lg hover:bg-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t("notifications")}>
          <Bell className="h-5 w-5 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-5 min-w-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold">{unreadCount > 99 ? "99+" : unreadCount}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="font-semibold text-sm">{t("notifications")}</span>
          {unreadCount > 0 && <button onClick={() => markAllAsRead.mutate()} className="text-xs text-primary hover:underline">{t("toutMarquerLu")}</button>}
        </div>
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">{t("aucuneNotif")}</div>
          ) : (
            <div>
              {notifications.map((notif) => {
                const { Icon, color } = notifTypeMeta(notif.type);
                return (
                  <button key={notif.id} onClick={() => handleClick(notif)} className={`w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors border-b last:border-b-0 ${!notif.lu ? "bg-primary/5" : ""}`}>
                    <div className="flex gap-3">
                      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm truncate ${!notif.lu ? "font-semibold" : ""}`}>{notif.titre}</span>
                          {!notif.lu && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                        </div>
                        {notif.message && <p className="text-xs text-muted-foreground truncate mt-0.5">{notif.message}</p>}
                        <p className="text-xs text-muted-foreground mt-1">{formatRelativeDate(notif.createdAt)}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
        <div className="border-t px-4 py-2">
          <button onClick={() => { setOpen(false); setLocation("/notifications"); }} className="text-xs text-primary hover:underline w-full text-center">{t("voirToutesNotifs")}</button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
