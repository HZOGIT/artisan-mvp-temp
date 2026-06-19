import { trpc } from "@/shared/trpc";
import type { DashboardStats, DashboardObjectifs, DashboardAlertData } from "../domain/dashboard";

/*
 * Couche APPLICATION de la feature `dashboard` (clean-archi) : SEULE couche important tRPC.
 * Charge les 5 sources de l'en-tête du dashboard (stats, taux de conversion, alertes, objectifs,
 * profil artisan) + l'utilisateur courant (`auth.me`, pour le prénom/onboarding). staleTime aligné
 * sur le legacy (30 s stats, 60 s conversion/alertes, 5 min objectifs/profil), refetchOnWindowFocus off.
 */
export function useDashboard() {
  const statsQ = trpc.dashboard.getStats.useQuery(undefined, { staleTime: 30_000, refetchOnWindowFocus: false });
  const conversionQ = trpc.dashboard.getConversionRate.useQuery(undefined, { staleTime: 60_000, refetchOnWindowFocus: false });
  const alertsQ = trpc.dashboard.getAlerts.useQuery(undefined, { staleTime: 60_000, refetchOnWindowFocus: false });
  const objectifsQ = trpc.dashboard.getObjectifs.useQuery(undefined, { staleTime: 300_000, refetchOnWindowFocus: false });
  const profileQ = trpc.artisan.getProfile.useQuery(undefined, { staleTime: 300_000, refetchOnWindowFocus: false });
  const meQ = trpc.auth.me.useQuery();

  const stats: DashboardStats | undefined = statsQ.data;
  const conversionRate: number = conversionQ.data ?? 0;
  const alerts: DashboardAlertData[] = alertsQ.data ?? [];
  const objectifs: DashboardObjectifs | undefined = objectifsQ.data;

  return {
    stats,
    statsLoading: statsQ.isLoading,
    conversionRate,
    alerts,
    objectifs,
    artisan: profileQ.data,
    currentUserName: meQ.data?.name ?? null,
  };
}
