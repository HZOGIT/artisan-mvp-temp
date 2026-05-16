import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Clock } from "lucide-react";

// Banner d'essai gratuit affiche dans DashboardLayout quand
// trialDaysLeft <= 7 et status === 'trialing'. Couleur evolue selon
// l'urgence : bleu (>=4j), orange (2-3j), rouge (<=1j).

export function TrialBanner() {
  const { data: sub } = trpc.subscription.getCurrent.useQuery(undefined, {
    // On evite de refetch a chaque navigation, mais on garde frais sur 1 min.
    staleTime: 60 * 1000,
  });

  if (!sub) return null;
  if (sub.status !== "trialing") return null;
  if (sub.trialDaysLeft > 7) return null;

  const isCritical = sub.trialDaysLeft <= 1;
  const isUrgent = sub.trialDaysLeft <= 3;

  const cls = isCritical
    ? "bg-red-50 border-red-200 text-red-900 dark:bg-red-950/40 dark:border-red-900 dark:text-red-200"
    : isUrgent
      ? "bg-orange-50 border-orange-200 text-orange-900 dark:bg-orange-950/40 dark:border-orange-900 dark:text-orange-200"
      : "bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-200";

  const Icon = isCritical || isUrgent ? AlertTriangle : Clock;

  const txt =
    sub.trialDaysLeft <= 0
      ? "Votre essai gratuit se termine aujourd'hui."
      : sub.trialDaysLeft === 1
        ? "Votre essai gratuit se termine demain."
        : `Votre essai gratuit se termine dans ${sub.trialDaysLeft} jours.`;

  return (
    <div className={`border-b ${cls}`}>
      <div className="max-w-screen-2xl mx-auto px-4 py-2.5 flex items-center gap-3 text-sm">
        <Icon className={`h-4 w-4 shrink-0 ${isCritical ? "animate-pulse" : ""}`} />
        <span className="flex-1 truncate font-medium">
          {txt} Choisissez votre plan pour continuer sans interruption.
        </span>
        <Link
          to="/parametres?tab=abonnement"
          className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-white/80 dark:bg-black/30 px-3 py-1.5 text-xs font-semibold hover:bg-white dark:hover:bg-black/50 transition-colors"
        >
          Choisir mon plan →
        </Link>
      </div>
    </div>
  );
}
