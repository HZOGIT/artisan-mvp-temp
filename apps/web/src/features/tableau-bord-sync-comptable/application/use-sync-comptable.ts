import { trpc } from "@/shared/trpc";
import type { SyncRow, SyncStatus, PendingItems } from "../domain/sync-comptable";

/*
 * Couche APPLICATION — tableau de bord des synchronisations comptables : statut + logs + en-attente +
 * exports + lancement de sync (avec invalidations). SEULE couche important tRPC.
 */
export function useSyncComptable() {
  const utils = trpc.useUtils();
  const statusQ = trpc.integrationsComptables.getSyncStatus.useQuery();
  const logsQ = trpc.integrationsComptables.getSyncLogs.useQuery();
  const pendingQ = trpc.integrationsComptables.getPendingItems.useQuery();
  const exportsQ = trpc.integrationsComptables.getExports.useQuery();

  const lancerSync = trpc.integrationsComptables.lancerSync.useMutation({
    onSuccess: () => {
      utils.integrationsComptables.getSyncLogs.invalidate();
      utils.integrationsComptables.getSyncStatus.invalidate();
      utils.integrationsComptables.getPendingItems.invalidate();
    },
  });

  const syncStatus: SyncStatus | undefined = statusQ.data;
  const syncLogs: SyncRow[] = logsQ.data ?? [];
  const pendingItems: PendingItems | undefined = pendingQ.data;
  const exportsData: SyncRow[] = exportsQ.data ?? [];

  return { syncStatus, syncLogs, pendingItems, exports: exportsData, lancerSync };
}
