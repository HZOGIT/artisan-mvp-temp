import { trpc } from "@/shared/trpc";
import type { AlertesConfig, AlerteHistorique } from "../domain/alertes-previsions";

// Couche APPLICATION — alertes prévisions CA : config + historique + sauvegarde + vérification manuelle.
// SEULE couche important tRPC ; effets (toast) en UI via options.
export function useAlertesPrevisions() {
  const configQ = trpc.alertesPrevisions.getConfig.useQuery();
  const historiqueQ = trpc.alertesPrevisions.getHistorique.useQuery();

  const save = trpc.alertesPrevisions.saveConfig.useMutation({ onSuccess: () => configQ.refetch() });
  const verifier = trpc.alertesPrevisions.verifierEtEnvoyer.useMutation({ onSuccess: () => historiqueQ.refetch() });

  const config: AlertesConfig | undefined = configQ.data;
  const historique: AlerteHistorique[] = historiqueQ.data ?? [];

  return { config, historique, save, verifier };
}
