import { useTranslation } from "react-i18next";
import { useLocation } from "@/modern/shared/router/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Calendar, Clock, MapPin } from "lucide-react";
import { Button } from "@/modern/shared/ui/button";
import { useUpcomingInterventions } from "../../application/use-dashboard-widgets";
import { WidgetSkeleton } from "./widget-skeleton";

// Prochaines interventions du dashboard. Re-port de widgets/UpcomingInterventions (clean-archi, i18n).
const STATUT_COLORS: Record<string, string> = {
  planifiee: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300", en_cours: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  terminee: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300", annulee: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
};
const STATUT_LABELS: Record<string, string> = { planifiee: "Planifiée", en_cours: "En cours", terminee: "Terminée", annulee: "Annulée" };
function formatDateHeure(date: string | Date): string {
  return new Date(date).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
export function UpcomingInterventionsWidget() {
  const { t } = useTranslation("dashboard");
  const { interventions, isLoading } = useUpcomingInterventions();
  const [, setLocation] = useLocation();
  if (isLoading) return <WidgetSkeleton height={220} lines={4} />;
  const list = interventions.slice(0, 3);
  if (list.length === 0) {
    return <div className="flex flex-col items-center justify-center text-muted-foreground py-10 gap-2"><Calendar className="h-8 w-8 opacity-30" /><p className="text-sm">{t("ui_aucune")}</p></div>;
  }
  return (
    <div className="space-y-3">
      {list.map((intervention, i) => {
        const c = intervention.client;
        const clientName = c ? `${c.prenom || ""} ${c.nom || ""}`.trim() || t("ui_client") : t("ui_client");
        const statutCls = STATUT_COLORS[intervention.statut] || "bg-muted text-muted-foreground";
        const statutLabel = STATUT_LABELS[intervention.statut] || intervention.statut;
        return (
          <motion.div key={intervention.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.3 }} onClick={() => setLocation("/interventions")} className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/60 p-3 hover:bg-accent/40 cursor-pointer transition-colors">
            <div className="h-9 w-9 shrink-0 rounded-lg bg-orange-100 dark:bg-orange-900/30 inline-flex items-center justify-center"><Calendar className="h-4 w-4 text-orange-600 dark:text-orange-400" /></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium truncate">{intervention.titre || t("ui_intervention")}</p>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${statutCls}`}>{statutLabel}</span>
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{clientName}</p>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {formatDateHeure(intervention.dateDebut)}</span>
                {intervention.adresse && <span className="inline-flex items-center gap-1 truncate"><MapPin className="h-3 w-3" /> {intervention.adresse}</span>}
              </div>
            </div>
          </motion.div>
        );
      })}
      <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setLocation("/interventions")}>{t("ui_voirToutes")}<ArrowRight className="h-3 w-3 ml-1" /></Button>
    </div>
  );
}
