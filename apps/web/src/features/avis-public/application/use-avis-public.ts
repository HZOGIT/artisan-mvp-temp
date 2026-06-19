import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/shared/trpc";

/*
 * Couche APPLICATION — avis public : infos de la demande (par token) + soumission de l'avis. SEULE couche
 * important tRPC ; effets (toast, état submitted) gérés en UI via options.
 */
export function useAvisPublic(token: string) {
  const infoQ = trpc.avis.getDemandeInfo.useQuery(token ? { token } : skipToken);
  const submit = trpc.avis.submitAvis.useMutation();
  return { info: infoQ.data, isLoading: infoQ.isLoading, error: infoQ.error, submit };
}
