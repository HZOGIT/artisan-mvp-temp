import { useTranslation } from "react-i18next";
import { Link } from "@/shared/router/navigation";
import { FileText, CalendarClock, CheckCircle2 } from "lucide-react";
import { useContratsAFacturer } from "../../application/use-dashboard-widgets";
import { WidgetSkeleton } from "./widget-skeleton";

// Contrats de maintenance à facturer (lecture seule). Re-port de widgets/ContratsAFacturer (clean-archi, i18n).
const PERIODICITE_LABELS: Record<string, string> = { mensuel: "Mensuel", trimestriel: "Trimestriel", semestriel: "Semestriel", annuel: "Annuel" };

export function ContratsAFacturerWidget() {
  const { t } = useTranslation("dashboard");
  const { contrats, isLoading } = useContratsAFacturer();
  if (isLoading) return <WidgetSkeleton height={220} lines={4} />;
  if (contrats.length === 0) {
    return <div className="flex flex-col items-center justify-center text-muted-foreground py-8 gap-2"><CheckCircle2 className="h-8 w-8 opacity-30" /><p className="text-sm">{t("caf_aucun")}</p></div>;
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-amber-600"><CalendarClock className="h-3.5 w-3.5" />{t("caf_aFacturer", { count: contrats.length })}</div>
      {contrats.slice(0, 6).map((c) => (
        <Link key={c.id} href={`/contrats/${c.id}`} className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/60 p-2.5 hover:border-amber-300 transition-colors">
          <FileText className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{c.titre} — {c.clientNom}</p>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">{t("caf_ttc", { m: c.montantTTC })}</span>
              {c.joursRetard > 0 ? <span className="font-semibold text-amber-600">{t("caf_echueDepuis", { n: c.joursRetard })}</span> : <span>{t("caf_echeanceAuj")}</span>}
              <span className="px-1.5 py-0.5 rounded-full bg-muted text-[10px] font-semibold">{PERIODICITE_LABELS[c.periodicite] || c.periodicite}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
