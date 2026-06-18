import { trpc, type RouterOutputs } from "@/shared/trpc";

// Couche APPLICATION des widgets dashboard (lecture seule) — SEULE couche important tRPC.
// Certaines sorties backend sont enrichies au runtime mais typées « lean » (ex. getEnRetard) → on déclare
// ici le type réellement renvoyé et on caste à la frontière (finding backend documenté).
export type ContratAFacturer = RouterOutputs["contrats"]["getAFacturer"][number];
export type LivraisonEnRetard = RouterOutputs["commandesFournisseurs"]["getEnRetard"][number] & {
  fournisseurNom?: string; numero?: string; joursRetard: number; dateLivraisonPrevue?: string | null; statut: string;
};

export function useContratsAFacturer() {
  const { data, isLoading } = trpc.contrats.getAFacturer.useQuery();
  return { contrats: (data ?? []) as ContratAFacturer[], isLoading };
}
export function useLivraisonsEnRetard() {
  const { data, isLoading } = trpc.commandesFournisseurs.getEnRetard.useQuery();
  return { commandes: (data ?? []) as LivraisonEnRetard[], isLoading };
}

export type RecentActivityItem = RouterOutputs["dashboard"]["getRecentActivity"][number];
export type UpcomingIntervention = RouterOutputs["dashboard"]["getUpcomingInterventions"][number] & {
  titre?: string; statut: string; dateDebut: string; adresse?: string | null;
  client?: { prenom?: string | null; nom?: string | null } | null;
};
export function useRecentActivity() {
  const { data, isLoading } = trpc.dashboard.getRecentActivity.useQuery({ limit: 8 });
  return { activities: (data ?? []) as RecentActivityItem[], isLoading };
}
export function useUpcomingInterventions() {
  const { data, isLoading } = trpc.dashboard.getUpcomingInterventions.useQuery();
  return { interventions: (data ?? []) as UpcomingIntervention[], isLoading };
}

export type LowStockItem = RouterOutputs["stocks"]["getLowStock"][number] & {
  enRupture?: boolean; designation: string; quantiteEnStock: number; unite?: string | null; seuilAlerte: number; manque: number;
};
export function useLowStock() {
  const { data, isLoading } = trpc.stocks.getLowStock.useQuery();
  return { items: (data ?? []) as LowStockItem[], isLoading };
}
export function useObjectifs() {
  const { data, isLoading } = trpc.dashboard.getObjectifs.useQuery();
  return { objectifs: data, isLoading };
}

export type MonthlyCAItem = RouterOutputs["dashboard"]["getMonthlyCA"][number] & { month?: string; label?: string; ca?: number; total?: number; revenue?: number };
export function useMonthlyCA() {
  const { data, isLoading } = trpc.dashboard.getMonthlyCA.useQuery({ months: 6 });
  return { months: (data ?? []) as MonthlyCAItem[], isLoading };
}
export function useDevisStats() {
  const { data, isLoading } = trpc.statistiques.getDevisStats.useQuery();
  return { parStatut: (data?.parStatut ?? {}) as Record<string, number>, isLoading };
}

export type TopClientRow = RouterOutputs["dashboard"]["getTopClients"][number] & {
  totalCA?: number; client?: { id?: number; prenom?: string | null; nom?: string | null; entreprise?: string | null } | null;
};
export function useTopClients() {
  const { data, isLoading } = trpc.dashboard.getTopClients.useQuery({ limit: 5 });
  return { rows: (data ?? []) as TopClientRow[], isLoading };
}
export function useTresoreriePrevisionnelle() {
  const { data, isLoading } = trpc.previsions.getTresoreriePrevisionnelle.useQuery({ semaines: 8 });
  return { data, isLoading };
}
