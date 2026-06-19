import { trpc } from "@/shared/trpc";
import type { RapportCommande, Artisan } from "../domain/rapport-commande";

/*
 * Couche APPLICATION — rapport de commande fournisseur (articles en rupture) + profil artisan (en-tête
 * PDF). SEULE couche important tRPC.
 */
export function useRapportCommande() {
  const rapportQ = trpc.stocks.getRapportCommande.useQuery();
  const artisanQ = trpc.artisan.getProfile.useQuery();

  const rapport: RapportCommande = rapportQ.data ?? [];
  const artisan: Artisan | undefined = artisanQ.data;

  return { rapport, artisan, isLoading: rapportQ.isLoading };
}
