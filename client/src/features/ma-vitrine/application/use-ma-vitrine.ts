import { trpc } from "@/shared/trpc";
import type { VitrineSettings, ArtisanProfile, Avis, ClientItem } from "../domain/ma-vitrine";

// Couche APPLICATION — Ma Vitrine : paramètres vitrine + profil (slug) + avis (modération/réponse/demande)
// + clients (sélecteur de demande d'avis). SEULE couche important tRPC ; effets en UI via options.
export function useMaVitrine() {
  const parametresQ = trpc.vitrine.getSettings.useQuery();
  const artisanQ = trpc.artisan.getProfile.useQuery();
  const avisQ = trpc.avis.getAll.useQuery();
  const clientsQ = trpc.clients.list.useQuery();
  const refetchAvis = () => avisQ.refetch();

  const updateParametres = trpc.vitrine.updateSettings.useMutation();
  const updateProfile = trpc.artisan.updateProfile.useMutation();
  const repondre = trpc.avis.repondre.useMutation({ onSuccess: () => refetchAvis() });
  const moderer = trpc.avis.moderer.useMutation({ onSuccess: () => refetchAvis() });
  const envoyerDemande = trpc.avis.envoyerDemandeParClient.useMutation();

  const parametres: VitrineSettings | undefined = parametresQ.data;
  const artisan: ArtisanProfile | undefined = artisanQ.data;
  const avis: Avis[] = avisQ.data ?? [];
  const clients: ClientItem[] = clientsQ.data ?? [];

  return { parametres, artisan, avis, clients, updateParametres, updateProfile, repondre, moderer, envoyerDemande };
}
