import { trpc } from "@/shared/trpc";
import type { Config, SyncRow, PendingItems, SyncStatus } from "../domain/integrations-comptables";

/*
 * Couche APPLICATION — intégrations comptables : config + exports + logs + statut + en-attente, et toutes
 * les mutations (config, sync config, export, lancer/retry sync). SEULE couche important tRPC.
 */
export function useIntegrationsComptables() {
  const utils = trpc.useUtils();
  const configQ = trpc.integrationsComptables.getConfig.useQuery();
  const exportsQ = trpc.integrationsComptables.getExports.useQuery();
  const logsQ = trpc.integrationsComptables.getSyncLogs.useQuery();
  const statusQ = trpc.integrationsComptables.getSyncStatus.useQuery();
  const pendingQ = trpc.integrationsComptables.getPendingItems.useQuery();

  const invalidateConfig = () => utils.integrationsComptables.getConfig.invalidate();
  const invalidateSync = () => {
    utils.integrationsComptables.getSyncLogs.invalidate();
    utils.integrationsComptables.getSyncStatus.invalidate();
    utils.integrationsComptables.getPendingItems.invalidate();
  };

  const invalidateLock = () => utils.integrationsComptables.getLockDate.invalidate();

  const saveConfig = trpc.integrationsComptables.saveConfig.useMutation({ onSuccess: invalidateConfig });
  const saveSyncConfig = trpc.integrationsComptables.saveSyncConfig.useMutation({ onSuccess: invalidateConfig });
  const genererExport = trpc.integrationsComptables.genererExport.useMutation({ onSuccess: () => utils.integrationsComptables.getExports.invalidate() });
  const lancerSync = trpc.integrationsComptables.lancerSync.useMutation({ onSuccess: invalidateSync });
  const retrySync = trpc.integrationsComptables.retrySync.useMutation({ onSuccess: () => { utils.integrationsComptables.getSyncLogs.invalidate(); utils.integrationsComptables.getPendingItems.invalidate(); } });
  const verrouillerCompta = trpc.integrationsComptables.verrouillerCompta.useMutation({ onSuccess: () => { invalidateConfig(); invalidateLock(); } });

  const config: Config | undefined = configQ.data;
  const lockDate: string | null | undefined = trpc.integrationsComptables.getLockDate.useQuery().data;
  const exportsData: SyncRow[] = exportsQ.data ?? [];
  const syncLogs: SyncRow[] = logsQ.data ?? [];
  const syncStatus: SyncStatus | undefined = statusQ.data;
  const pendingItems: PendingItems | undefined = pendingQ.data;

  return { config, lockDate, exports: exportsData, syncLogs, syncStatus, pendingItems, exportsLoading: exportsQ.isLoading, saveConfig, saveSyncConfig, genererExport, lancerSync, retrySync, verrouillerCompta };
}
