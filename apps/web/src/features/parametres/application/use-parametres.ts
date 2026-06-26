import { trpc } from "@/shared/trpc";
import type { Parametres, ArtisanProfile, IcalFeed, DemandeContact, VitrineSettings } from "../domain/parametres";

/*
 * Couche APPLICATION de la feature `parametres` (clean-archi) : SEULE couche important tRPC.
 * Agrège les 4 sous-domaines de l'onglet « général » : paramètres (singleton), profil artisan
 * (slug/logo), flux iCal, demandes de contact (leads vitrine) + leurs mutations. Les effets de
 * présentation (toasts) sont attachés par l'UI via `mutate(vars, { onSuccess, onError })`.
 */
export function useParametres() {
  const utils = trpc.useUtils();
  const parametresQ = trpc.parametres.get.useQuery();
  const artisanQ = trpc.artisan.getProfile.useQuery();
  const icalQ = trpc.calendrier.getIcalFeed.useQuery();
  const demandesQ = trpc.vitrine.getDemandesContact.useQuery();
  const vitrineQ = trpc.vitrine.getSettings.useQuery();

  const updateParametres = trpc.parametres.update.useMutation();
  const updateProfile = trpc.artisan.updateProfile.useMutation();
  const updateVitrine = trpc.vitrine.updateSettings.useMutation({ onSuccess: () => utils.vitrine.getSettings.invalidate() });
  const regenerateIcal = trpc.calendrier.regenerateIcalFeed.useMutation({
    onSuccess: () => utils.calendrier.getIcalFeed.invalidate(),
  });
  const invalidateDemandes = () => utils.vitrine.getDemandesContact.invalidate();
  const updateDemandeStatut = trpc.vitrine.updateDemandeContactStatut.useMutation({ onSuccess: invalidateDemandes });
  const convertirDemande = trpc.vitrine.convertirDemandeEnClient.useMutation({ onSuccess: invalidateDemandes });

  const parametres: Parametres | undefined = parametresQ.data;
  const artisan: ArtisanProfile | undefined = artisanQ.data;
  const icalFeed: IcalFeed | undefined = icalQ.data;
  /** résolu : `getDemandesContact` renvoie un DTO typé → type dérivé, plus d'assertion. */
  const demandes: DemandeContact[] = demandesQ.data ?? [];
  const vitrineSettings: VitrineSettings | undefined = vitrineQ.data;

  return {
    parametres,
    artisan,
    icalFeed,
    demandes,
    vitrineSettings,
    isLoading: parametresQ.isLoading,
    refetchArtisan: () => utils.artisan.getProfile.invalidate(),
    updateParametres,
    updateProfile,
    updateVitrine,
    regenerateIcal,
    updateDemandeStatut,
    convertirDemande,
  };
}
