import { trpc } from "@/modern/shared/trpc";
import type { PortailClientInfo } from "../domain/portail";

// Couche APPLICATION — SLICE 6 : coordonnées du client connecté (onglet « Mes infos »), gated par la
// validité de l'accès. SEULE couche important tRPC.
export function usePortailInfos(token: string, enabled: boolean) {
  const infoQ = trpc.clientPortal.getClientInfo.useQuery({ token }, { enabled: enabled && !!token });
  const clientInfo: PortailClientInfo | null = infoQ.data ?? null;
  return { clientInfo };
}
