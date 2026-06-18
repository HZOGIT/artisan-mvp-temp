import { useTranslation } from "react-i18next";
import { TrendingDown, AlertTriangle, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useTresoreriePrevisionnelle } from "../../application/use-dashboard-widgets";
import { WidgetSkeleton } from "./widget-skeleton";

// Trésorerie prévisionnelle 8 semaines (flux net + alerte découvert). Re-port de widgets/TresoreriePrevisionnelle.
const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function TresoreriePrevisionnelleWidget() {
  const { t } = useTranslation("dashboard");
  const { data, isLoading } = useTresoreriePrevisionnelle();
  if (isLoading) return <WidgetSkeleton height={260} lines={5} />;
  const semaines = data?.semaines ?? [];
  const pireCumul = semaines.reduce((min, s) => Math.min(min, s.cumulatif), 0);
  const decouvert = pireCumul < 0;
  if (semaines.length === 0 || (data?.totalEntrees === 0 && data?.totalSorties === 0)) {
    return <div className="flex flex-col items-center justify-center text-muted-foreground py-10 gap-2"><TrendingDown className="h-8 w-8 opacity-30" /><p className="text-sm text-center">{t("tp_aucun")}</p></div>;
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-emerald-50 p-2"><p className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><ArrowUpRight className="h-3 w-3" /> {t("tp_encaissements")}</p><p className="text-sm font-bold text-emerald-700">{eur(data?.totalEntrees || 0)}</p></div>
        <div className="rounded-lg bg-rose-50 p-2"><p className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><ArrowDownRight className="h-3 w-3" /> {t("tp_decaissements")}</p><p className="text-sm font-bold text-rose-700">{eur(data?.totalSorties || 0)}</p></div>
        <div className="rounded-lg bg-muted p-2"><p className="text-[11px] text-muted-foreground">{t("tp_net8")}</p><p className={`text-sm font-bold ${(data?.totalNet || 0) < 0 ? "text-rose-700" : "text-emerald-700"}`}>{(data?.totalNet || 0) >= 0 ? "+" : ""}{eur(data?.totalNet || 0)}</p></div>
      </div>
      {decouvert && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-amber-800 text-xs">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span><strong>{t("tp_decouvertTitre")}</strong> : <strong>{eur(pireCumul)}</strong></span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-muted-foreground border-b"><th className="text-left font-medium py-1">{t("tp_semaineDu")}</th><th className="text-right font-medium py-1">{t("tp_entrees")}</th><th className="text-right font-medium py-1">{t("tp_sorties")}</th><th className="text-right font-medium py-1">{t("tp_netCumule")}</th></tr></thead>
          <tbody>
            {semaines.map((s) => (
              <tr key={s.debut} className="border-b last:border-0">
                <td className="py-1.5">{new Date(s.debut).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</td>
                <td className="py-1.5 text-right text-emerald-700">{s.entrees > 0 ? eur(s.entrees) : "—"}</td>
                <td className="py-1.5 text-right text-rose-700">{s.sorties > 0 ? eur(s.sorties) : "—"}</td>
                <td className={`py-1.5 text-right font-semibold ${s.cumulatif < 0 ? "text-rose-700" : ""}`}>{s.cumulatif >= 0 ? "+" : ""}{eur(s.cumulatif)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground">{t("tp_note")}</p>
    </div>
  );
}
