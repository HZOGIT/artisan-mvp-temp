import { trpc } from "@/modern/shared/trpc";
import type { VerifyAccess } from "../domain/portail";

// Couche APPLICATION de la feature `portail` (clean-archi) : SEULE couche important tRPC.
// SLICE 1 : vérification d'accès par token (publique). Les requêtes des onglets (gated par
// `access.valid`) seront ajoutées dans leurs slices respectifs.
export function usePortailAccess(token: string) {
  const accessQ = trpc.clientPortal.verifyAccess.useQuery({ token }, { enabled: !!token });
  const access: VerifyAccess | undefined = accessQ.data;
  return { access, isLoading: accessQ.isLoading };
}
