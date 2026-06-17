import { trpc } from "@/modern/shared/trpc";

// Couche APPLICATION — SLICE 6 : demande IA (structuration assistée) + demande de modification des
// coordonnées. SEULE couche important tRPC ; les effets (reset form, état succès) restent en UI.
export function usePortailDemande() {
  const soumettreDemandeIA = trpc.clientPortal.soumettreDemandeIA.useMutation();
  const demanderModification = trpc.clientPortal.demanderModification.useMutation();
  return { soumettreDemandeIA, demanderModification };
}
