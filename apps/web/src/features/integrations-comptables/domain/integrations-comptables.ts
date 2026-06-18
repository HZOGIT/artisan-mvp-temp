import type { RouterInputs, RouterOutputs } from "@/shared/trpc";

// Couche DOMAIN de la feature `integrations-comptables` (config export/sync vers logiciels comptables).
// Types dérivés du routeur, formulaires typés, mapping config→formulaire et helpers purs testables.
//
// ⚠️ Comme pour le dashboard sync : `getSyncLogs` ET `getExports` renvoient `ExportComptableRow` (sans
// `type`/`facturesSyncees`) ; `lancerSync` renvoie `{success,nbItems,message}`. Le legacy lisait des
// champs inexistants (masqué par `any`) → on s'aligne sur le vrai contrat (détail = nombreEcritures).

export type Config = RouterOutputs["integrationsComptables"]["getConfig"];
export type SyncRow = RouterOutputs["integrationsComptables"]["getExports"][number];
export type PendingItems = RouterOutputs["integrationsComptables"]["getPendingItems"];
export type PendingItem = PendingItems["items"][number];
export type SyncStatus = RouterOutputs["integrationsComptables"]["getSyncStatus"];

export type Logiciel = NonNullable<RouterInputs["integrationsComptables"]["genererExport"]["logiciel"]>;
export type FormatExport = NonNullable<RouterInputs["integrationsComptables"]["genererExport"]["formatExport"]>;
export type FrequenceSync = NonNullable<RouterInputs["integrationsComptables"]["saveSyncConfig"]["frequenceSync"]>;

export const LOGICIELS: readonly Logiciel[] = ["sage", "quickbooks", "ciel", "ebp", "autre"];
export const FORMATS: readonly FormatExport[] = ["fec", "iif", "qbo", "csv"];
export const FREQUENCES: readonly FrequenceSync[] = ["quotidien", "hebdomadaire", "mensuel", "manuel"];

export type ExportForm = { logiciel: Logiciel; formatExport: FormatExport; dateDebut: string; dateFin: string };
export type SyncConfigForm = {
  syncAutoFactures: boolean; syncAutoPaiements: boolean; frequenceSync: FrequenceSync;
  heureSync: string; notifierErreurs: boolean; notifierSucces: boolean;
};
export type ConfigForm = {
  logiciel: Logiciel; formatExport: FormatExport;
  compteVentes: string; compteTVACollectee: string; compteClients: string;
  compteAchats: string; compteTVADeductible: string; compteFournisseurs: string;
  compteBanque: string; compteCaisse: string;
  journalVentes: string; journalAchats: string; journalBanque: string;
  prefixeFacture: string; prefixeAvoir: string; exerciceDebut: number; actif: boolean;
};

export function defaultExportForm(): ExportForm {
  return { logiciel: "sage", formatExport: "fec", dateDebut: "", dateFin: "" };
}
export const DEFAULT_CONFIG_FORM: ConfigForm = {
  logiciel: "sage", formatExport: "fec", compteVentes: "701000", compteTVACollectee: "445710",
  compteClients: "411000", compteAchats: "607000", compteTVADeductible: "445660", compteFournisseurs: "401000",
  compteBanque: "512000", compteCaisse: "530000", journalVentes: "VE", journalAchats: "AC", journalBanque: "BQ",
  prefixeFacture: "FA", prefixeAvoir: "AV", exerciceDebut: 1, actif: true,
};
export const DEFAULT_SYNC_CONFIG: SyncConfigForm = {
  syncAutoFactures: false, syncAutoPaiements: false, frequenceSync: "quotidien",
  heureSync: "02:00", notifierErreurs: true, notifierSucces: false,
};

// Hydrate le formulaire de synchronisation depuis la config sauvegardée. PUR.
export function syncConfigFromConfig(config: Config): SyncConfigForm {
  if (!config) return DEFAULT_SYNC_CONFIG;
  const freq = config.frequenceSync;
  return {
    syncAutoFactures: config.syncAutoFactures || false,
    syncAutoPaiements: config.syncAutoPaiements || false,
    frequenceSync: FREQUENCES.includes(freq as FrequenceSync) ? (freq as FrequenceSync) : "quotidien",
    heureSync: config.heureSync || "02:00",
    notifierErreurs: config.notifierErreurs !== false,
    notifierSucces: config.notifierSucces || false,
  };
}

// Variante shadcn d'un statut (libellé via i18n `statut.<statut>`). PUR.
export function statutVariant(statut: string): "default" | "secondary" | "destructive" {
  switch (statut) {
    case "termine": case "succes": return "default";
    case "erreur": return "destructive";
    default: return "secondary";
  }
}

// Total d'éléments en attente (factures + paiements + erreurs). PUR.
export function pendingTotal(pending: PendingItems | undefined): number {
  return (pending?.facturesEnAttente || 0) + (pending?.paiementsEnAttente || 0) + (pending?.erreurs || 0);
}

// Nom de fichier d'export téléchargé. PUR.
export function exportFilename(logiciel: string, format: string, date: Date = new Date()): string {
  return `export_${logiciel}_${format}_${date.toISOString().split("T")[0]}.txt`;
}
