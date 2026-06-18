import { useTranslation } from "react-i18next";
import { Link } from "@/modern/shared/router/navigation";
import { PackageCheck, TruckIcon, AlertTriangle } from "lucide-react";
import { useLivraisonsEnRetard } from "../../application/use-dashboard-widgets";
import { WidgetSkeleton } from "./widget-skeleton";

// Commandes fournisseurs en retard de livraison (lecture seule). Re-port de widgets/LivraisonsEnRetard.
const STATUT_LABELS: Record<string, string> = { envoyee: "Envoyée", confirmee: "Confirmée", partiellement_livree: "Partielle" };

export function LivraisonsEnRetardWidget() {
  const { t } = useTranslation("dashboard");
  const { commandes, isLoading } = useLivraisonsEnRetard();
  if (isLoading) return <WidgetSkeleton height={220} lines={4} />;
  if (commandes.length === 0) {
    return <div className="flex flex-col items-center justify-center text-muted-foreground py-8 gap-2"><PackageCheck className="h-8 w-8 opacity-30" /><p className="text-sm">{t("ler_aucun")}</p></div>;
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-rose-500"><AlertTriangle className="h-3.5 w-3.5" />{t("ler_enRetard", { count: commandes.length })}</div>
      {commandes.slice(0, 6).map((c) => (
        <Link key={c.id} href={`/commandes/${c.id}`} className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/60 p-2.5 hover:border-rose-300 transition-colors">
          <TruckIcon className="h-4 w-4 mt-0.5 shrink-0 text-rose-500" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{c.numero || t("ler_commandeNum", { id: c.id })} — {c.fournisseurNom}</p>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="font-semibold text-rose-500">{t("ler_joursRetard", { n: c.joursRetard })}</span>
              {c.dateLivraisonPrevue && <span>{t("ler_prevueLe", { date: new Date(c.dateLivraisonPrevue).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) })}</span>}
              <span className="px-1.5 py-0.5 rounded-full bg-muted text-[10px] font-semibold">{STATUT_LABELS[c.statut] || c.statut}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
