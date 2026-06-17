import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { trpc } from "@/modern/shared/trpc";
import { Button } from "@/modern/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { ScrollArea } from "@/modern/shared/ui/scroll-area";
import { Badge } from "@/modern/shared/ui/badge";
import {
  Bell, CheckCircle, AlertTriangle, Clock, Info, XCircle, Trash2, CheckCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

// Page Notifications du FRONT NEUF (`/v2/notifications`) — PORT CONFORME de `pages/Notifications.tsx`
// (parité visuelle stricte). JSX/Tailwind copiés à l'identique ; plomberie repointée : primitives
// `@/modern/shared/ui`, tRPC `@/modern/shared/trpc`, libellés i18n (namespace `notifications`,
// catalogue `fr` = textes actuels à l'identique). Données déjà servies par tRPC côté legacy.

const typeIcon: Record<string, any> = {
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

function formatRelativeDate(date: string | Date, t: TFunction<"notifications">) {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return t("relInstant");
  if (diffMin < 60) return t("relMinutes", { n: diffMin });
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return t("relHours", { n: diffH });
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return t("relYesterday");
  if (diffD < 7) return t("relDays", { n: diffD });
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export default function NotificationsPage() {
  const { t } = useTranslation("notifications");
  const [, setLocation] = useLocation();
  const [filter, setFilter] = useState<"toutes" | "nonlues">("toutes");

  const { data: notifications = [], refetch } = trpc.notifications.list.useQuery({
    nonLuesUniquement: filter === "nonlues",
    limit: 100,
  });
  const { data: unreadCount = 0 } = trpc.notifications.getUnreadCount.useQuery();

  const markAsReadMutation = trpc.notifications.markAsRead.useMutation({
    onSuccess: () => refetch(),
  });
  const markAllAsReadMutation = trpc.notifications.markAllAsRead.useMutation({
    onSuccess: () => { refetch(); toast.success(t("toastAllRead")); },
  });
  const deleteMutation = trpc.notifications.delete.useMutation({
    onSuccess: () => { refetch(); toast.success(t("toastDeleted")); },
  });

  const handleClick = (notif: any) => {
    if (!notif.lu) markAsReadMutation.mutate({ id: notif.id });
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
                onClick={() => markAllAsReadMutation.mutate()}
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
                {notifications.map((notif: any) => {
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
                        onClick={(e) => { e.stopPropagation(); deleteMutation.mutate({ id: notif.id }); }}
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
