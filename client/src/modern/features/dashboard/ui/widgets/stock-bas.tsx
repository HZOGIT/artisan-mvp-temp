import { useTranslation } from "react-i18next";
import { Link } from "@/modern/shared/router/navigation";
import { PackageX, PackageCheck, AlertTriangle } from "lucide-react";
import { useLowStock } from "../../application/use-dashboard-widgets";
import { WidgetSkeleton } from "./widget-skeleton";

// Stock à réapprovisionner (lecture seule). Re-port de widgets/StockBas (clean-archi, i18n, nav /v2).
export function StockBasWidget() {
  const { t } = useTranslation("dashboard");
  const { items, isLoading } = useLowStock();
  if (isLoading) return <WidgetSkeleton height={220} lines={4} />;
  if (items.length === 0) {
    return <div className="flex flex-col items-center justify-center text-muted-foreground py-8 gap-2"><PackageCheck className="h-8 w-8 opacity-30" /><p className="text-sm">{t("sb_aucun")}</p></div>;
  }
  const nbRupture = items.filter((s) => s.enRupture).length;
  return (
    <div className="space-y-2">
      <Link href="/v2/stocks?filtre=alerte" className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-rose-500 hover:underline">
        <AlertTriangle className="h-3.5 w-3.5" />{t("sb_aReappro", { count: items.length })}{nbRupture > 0 ? t("sb_rupture", { n: nbRupture }) : ""}
      </Link>
      {items.slice(0, 6).map((s) => (
        <Link key={s.id} href="/v2/stocks?filtre=alerte" className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/60 p-2.5 hover:border-rose-300 transition-colors">
          <PackageX className={`h-4 w-4 mt-0.5 shrink-0 ${s.enRupture ? "text-rose-600" : "text-amber-500"}`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{s.designation}</p>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className={s.enRupture ? "font-semibold text-rose-600" : ""}>{t("sb_enStock", { q: s.quantiteEnStock, u: s.unite || "" })}</span>
              <span>{t("sb_seuil", { s: s.seuilAlerte })}</span>
              {s.manque > 0 && <span className="px-1.5 py-0.5 rounded-full bg-muted text-[10px] font-semibold">{t("sb_manque", { n: s.manque })}</span>}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
