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
