import { trpc } from "@/shared/trpc";
import type { PortailDevis, PortailFacture } from "../domain/portail";

// Couche APPLICATION — SLICE 2 du portail : devis + factures du client (publiques par token, gated par
// la validité de l'accès). SEULE couche important tRPC. Le paiement (REST `/api/paiement/...`) reste
// en UI (ce n'est pas du tRPC).
export function usePortailDocuments(token: string, enabled: boolean) {
  const devisQ = trpc.clientPortal.getDevis.useQuery({ token }, { enabled: enabled && !!token });
  const facturesQ = trpc.clientPortal.getFactures.useQuery({ token }, { enabled: enabled && !!token });

  const devis: PortailDevis[] = devisQ.data ?? [];
  const factures: PortailFacture[] = facturesQ.data ?? [];

  return { devis, factures };
}
