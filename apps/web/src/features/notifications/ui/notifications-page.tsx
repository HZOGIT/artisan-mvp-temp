import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { LucideIcon } from "lucide-react";
import { useNotifications } from "../application/use-notifications";
import { relativeDateDescriptor, type NotifFilter, type Notification } from "../domain/notification";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { Badge } from "@/shared/ui/badge";
import {
  Bell, CheckCircle, AlertTriangle, Clock, Info, XCircle, Trash2, CheckCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "@/shared/router/navigation";

// Page Notifications du FRONT NEUF (`/notifications`) — clean-archi : présentation pure. Données &
// mutations via `useNotifications` (couche application, seule à importer tRPC) ; le calcul de date
// relative vient du domaine (`relativeDateDescriptor`, pur & testé). Parité visuelle stricte :
// JSX/Tailwind à l'identique. Libellés via i18n (namespace `notifications`).

const typeIcon: Record<string, LucideIcon> = {
  succes: CheckCircle,
  alerte: AlertTriangle,
  rappel: Clock,
  info: Info,
  erreur: XCircle,
};

const typeColor: Record<string, string> = {
  succes: "text-green-500",
  alerte: "text-orange-500",
  rappel: "text-blue-500",
  info: "text-sky-500",
  erreur: "text-red-500",
};

// Présentation : mappe le descripteur PUR du domaine vers les libellés i18n (et le format de repli).
function formatRelativeDate(date: string | Date, t: TFunction<"notifications">) {
  const r = relativeDateDescriptor(date);
  switch (r.kind) {
    case "instant": return t("relInstant");
    case "minutes": return t("relMinutes", { n: r.n });
    case "hours": return t("relHours", { n: r.n });
    case "yesterday": return t("relYesterday");
    case "days": return t("relDays", { n: r.n });
    case "date": return r.value.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  }
}

export default function NotificationsPage() {
  const { t } = useTranslation("notifications");
  const [, setLocation] = useLocation();
  const [filter, setFilter] = useState<NotifFilter>("toutes");

  const { notifications, unreadCount, markAsRead, markAllAsRead, remove } = useNotifications(
    filter === "nonlues",
  );
  const markAllAsReadMutation = markAllAsRead;
  const deleteMutation = remove;

  const handleClick = (notif: Notification) => {
    if (!notif.lu) markAsRead.mutate({ id: notif.id });
    if (notif.lien) setLocation(notif.lien);
  };

  return (
    <div className="max-w-3xl mx-auto">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bell className="h-5 w-5" />
              {t("title")}
              {unreadCount > 0 && (
                <Badge variant="destructive" className="ml-1">{t("unread", { count: unreadCount })}</Badge>
              )}
            </CardTitle>
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => markAllAsReadMutation.mutate(undefined, { onSuccess: () => toast.success(t("toastAllRead")) })}
                disabled={markAllAsReadMutation.isPending}
              >
                <CheckCheck className="h-4 w-4 mr-1" />
                {t("markAllRead")}
              </Button>
            )}
          </div>
          <div className="flex gap-2 mt-3">
            <Button
              variant={filter === "toutes" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("toutes")}
            >
              {t("filterAll")}
            </Button>
            <Button
              variant={filter === "nonlues" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("nonlues")}
            >
              {t("filterUnread")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[calc(100vh-280px)]">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Bell className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>{filter === "nonlues" ? t("emptyUnread") : t("empty")}</p>
              </div>
            ) : (
              <div>
                {notifications.map((notif: Notification) => {
                  const Icon = typeIcon[notif.type] || Info;
                  const color = typeColor[notif.type] || "text-muted-foreground";
                  return (
                    <div
                      key={notif.id}
                      className={`flex items-start gap-3 px-6 py-4 border-b last:border-b-0 hover:bg-accent/30 transition-colors ${
                        !notif.lu ? "bg-primary/5" : ""
                      }`}
                    >
                      <button
                        onClick={() => handleClick(notif)}
                        className="flex items-start gap-3 flex-1 text-left min-w-0"
                      >
                        <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 bg-muted ${color}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm ${!notif.lu ? "font-semibold" : ""}`}>
                              {notif.titre}
                            </span>
                            {!notif.lu && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                            <Badge variant="outline" className="text-[10px] ml-auto shrink-0">
                              {t(`type_${notif.type}`, { defaultValue: notif.type })}
                            </Badge>
                          </div>
                          {notif.message && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {notif.message}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatRelativeDate(notif.createdAt, t)}
                          </p>
                        </div>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); deleteMutation.mutate({ id: notif.id }, { onSuccess: () => toast.success(t("toastDeleted")) }); }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
