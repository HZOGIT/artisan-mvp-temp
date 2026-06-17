import { trpc } from "@/modern/shared/trpc";
import type { Parametres, ArtisanProfile, IcalFeed, DemandeContact } from "../domain/parametres";

// Couche APPLICATION de la feature `parametres` (clean-archi) : SEULE couche important tRPC.
// Agrège les 4 sous-domaines de l'onglet « général » : paramètres (singleton), profil artisan
// (slug/logo), flux iCal, demandes de contact (leads vitrine) + leurs mutations. Les effets de
// présentation (toasts) sont attachés par l'UI via `mutate(vars, { onSuccess, onError })`.
export function useParametres() {
  const utils = trpc.useUtils();
  const parametresQ = trpc.parametres.get.useQuery();
  const artisanQ = trpc.artisan.getProfile.useQuery();
  const icalQ = trpc.calendrier.getIcalFeed.useQuery();
  const demandesQ = trpc.vitrine.getDemandesContact.useQuery();

  const updateParametres = trpc.parametres.update.useMutation();
  const updateProfile = trpc.artisan.updateProfile.useMutation();
  const regenerateIcal = trpc.calendrier.regenerateIcalFeed.useMutation({
    onSuccess: () => utils.calendrier.getIcalFeed.invalidate(),
  });
  const invalidateDemandes = () => utils.vitrine.getDemandesContact.invalidate();
  const updateDemandeStatut = trpc.vitrine.updateDemandeContactStatut.useMutation({ onSuccess: invalidateDemandes });
  const convertirDemande = trpc.vitrine.convertirDemandeEnClient.useMutation({ onSuccess: invalidateDemandes });

  const parametres: Parametres | undefined = parametresQ.data;
  const artisan: ArtisanProfile | undefined = artisanQ.data;
  const icalFeed: IcalFeed | undefined = icalQ.data;
  // `getDemandesContact` est typé `unknown[]` côté backend (finding OPE-505) → assertion vers la forme
  // consommée par l'UI (champs id/nom/email/telephone/message/statut), sans `any`.
  const demandes = (demandesQ.data ?? []) as DemandeContact[];

  return {
    parametres,
    artisan,
    icalFeed,
    demandes,
    isLoading: parametresQ.isLoading,
    refetchArtisan: () => utils.artisan.getProfile.invalidate(),
    updateParametres,
    updateProfile,
    regenerateIcal,
    updateDemandeStatut,
    convertirDemande,
  };
}
