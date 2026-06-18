import { trpc, type RouterOutputs } from "@/modern/shared/trpc";

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
