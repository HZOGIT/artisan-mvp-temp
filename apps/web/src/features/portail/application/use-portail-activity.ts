import { trpc } from "@/shared/trpc";
import type { PortailIntervention, PortailChantier } from "../domain/portail";

/*
 * Couche APPLICATION — SLICE 3 du portail : interventions + suivi de chantiers du client (publiques par
 * token, gated par la validité de l'accès). SEULE couche important tRPC.
 */
export function usePortailActivity(token: string, enabled: boolean) {
  const interventionsQ = trpc.clientPortal.getInterventions.useQuery({ token }, { enabled: enabled && !!token });
  const chantiersQ = trpc.clientPortal.getSuiviChantiers.useQuery({ token }, { enabled: enabled && !!token });

  const interventions: PortailIntervention[] = interventionsQ.data ?? [];
  const chantiers: PortailChantier[] = chantiersQ.data ?? [];

  return { interventions, chantiers };
}
