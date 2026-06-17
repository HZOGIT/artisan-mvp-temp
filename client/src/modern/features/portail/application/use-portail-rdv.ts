import { trpc } from "@/modern/shared/trpc";
import type { PortailRdv } from "../domain/portail";

// Couche APPLICATION — SLICE 4 du portail : prise de RDV (créneaux dispo + mes RDV + demande), gated
// par la validité de l'accès. SEULE couche important tRPC. Les effets (toast, reset wizard) sont en UI.
export function usePortailRdv(token: string, enabled: boolean) {
  const utils = trpc.useUtils();
  const creneauxQ = trpc.clientPortal.getCreneauxDisponibles.useQuery({ token }, { enabled: enabled && !!token });
  const mesRdvQ = trpc.clientPortal.getMesRdv.useQuery({ token }, { enabled: enabled && !!token });

  const demanderRdv = trpc.clientPortal.demanderRdv.useMutation({
    onSuccess: () => utils.clientPortal.getMesRdv.invalidate(),
  });

  const creneaux: string[] = creneauxQ.data ?? [];
  const mesRdv: PortailRdv[] = mesRdvQ.data ?? [];

  return { creneaux, mesRdv, demanderRdv };
}
