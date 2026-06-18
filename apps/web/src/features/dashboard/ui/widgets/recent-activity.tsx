import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Activity, Calendar, FileText, Receipt, UserPlus, type LucideIcon } from "lucide-react";
import { useRecentActivity } from "../../application/use-dashboard-widgets";
import { WidgetSkeleton } from "./widget-skeleton";

// Activité récente du dashboard. Re-port de widgets/RecentActivity (clean-archi, i18n).
const TYPE_ICON: Record<string, LucideIcon> = { devis: FileText, facture: Receipt, intervention: Calendar, client: UserPlus };
const TYPE_COLOR: Record<string, string> = {
  devis: "text-blue-500 bg-blue-100 dark:bg-blue-900/30", facture: "text-emerald-500 bg-emerald-100 dark:bg-emerald-900/30",
  intervention: "text-orange-500 bg-orange-100 dark:bg-orange-900/30", client: "text-violet-500 bg-violet-100 dark:bg-violet-900/30",
};
function formatRelative(date: string | Date): string {
  const d = new Date(date); const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "À l'instant";
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60); if (diffH < 24) return `Il y a ${diffH}h`;
  const diffD = Math.floor(diffH / 24); if (diffD === 1) return "Hier"; if (diffD < 7) return `Il y a ${diffD} j`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
export function RecentActivityWidget() {
  const { t } = useTranslation("dashboard");
  const { activities, isLoading } = useRecentActivity();
  if (isLoading) return <WidgetSkeleton height={240} lines={6} />;
  if (activities.length === 0) {
    return <div className="flex flex-col items-center justify-center text-muted-foreground py-10 gap-2"><Activity className="h-8 w-8 opacity-30" /><p className="text-sm">{t("ra_aucune")}</p></div>;
  }
  return (
    <ul className="space-y-2.5">
      {activities.map((item, i) => {
        const Icon = TYPE_ICON[item.type] || Activity; const colorCls = TYPE_COLOR[item.type] || "text-muted-foreground bg-muted";
        return (
          <motion.li key={`${item.type}-${item.id}-${i}`} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05, duration: 0.3 }} className="flex items-center gap-3">
            <span className={`h-8 w-8 shrink-0 rounded-lg inline-flex items-center justify-center ${colorCls}`}><Icon className="h-4 w-4" /></span>
            <div className="flex-1 min-w-0"><p className="text-sm truncate">{item.titre}</p><p className="text-[11px] text-muted-foreground">{formatRelative(item.date)}</p></div>
          </motion.li>
        );
      })}
    </ul>
  );
}
