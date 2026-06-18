import { useTranslation } from "react-i18next";
import { Link } from "@/shared/router/navigation";
import { AlertTriangle, Clock } from "lucide-react";
import { trpc } from "@/shared/trpc";
import { trialBannerSeverity } from "../domain/subscription";

// Bannière d'essai gratuit du SHELL modern (slot `banners`). PORT FIDÈLE de TrialBanner : affichée si essai ≤ 7j,
// couleur selon l'urgence (bleu/orange/rouge). Décision en domain (`trialBannerSeverity`, testé). CTA → abonnement.
export function TrialBanner() {
  const { t } = useTranslation("shell");
  const { data: sub } = trpc.subscription.getCurrent.useQuery(undefined, { staleTime: 60 * 1000 });
  const severity = trialBannerSeverity(sub);
  if (!sub || !severity) return null;

  const cls = severity === "critical"
    ? "bg-red-50 border-red-200 text-red-900 dark:bg-red-950/40 dark:border-red-900 dark:text-red-200"
    : severity === "urgent"
      ? "bg-orange-50 border-orange-200 text-orange-900 dark:bg-orange-950/40 dark:border-orange-900 dark:text-orange-200"
      : "bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-200";
  const Icon = severity === "normal" ? Clock : AlertTriangle;
  const txt = sub.trialDaysLeft <= 0 ? t("trialToday") : sub.trialDaysLeft === 1 ? t("trialTomorrow") : t("trialDays", { n: sub.trialDaysLeft });

  return (
    <div className={`border-b ${cls}`}>
      <div className="max-w-screen-2xl mx-auto px-4 py-2.5 flex items-center gap-3 text-sm">
        <Icon className={`h-4 w-4 shrink-0 ${severity === "critical" ? "animate-pulse" : ""}`} />
        <span className="flex-1 truncate font-medium">{txt} {t("trialCtaSuffix")}</span>
        <Link to="/parametres?tab=abonnement" className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-white/80 dark:bg-black/30 px-3 py-1.5 text-xs font-semibold hover:bg-white dark:hover:bg-black/50 transition-colors">
          {t("choisirPlan")}
        </Link>
      </div>
    </div>
  );
}
